module.exports = async (req, res) => {
  // ------------------------------------------------------------
  // 1. Only allow GET requests
  // ------------------------------------------------------------

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // ------------------------------------------------------------
  // 2. Read search query
  // ------------------------------------------------------------

  const q = String(req.query?.q || "").trim();

  if (!q) {
    return res.status(400).json({
      error: "Search query is required"
    });
  }

  // ------------------------------------------------------------
  // 3. Read SerpApi key from Vercel Environment Variables
  // ------------------------------------------------------------

  const key = process.env.SERPAPI_KEY;

  if (!key) {
    return res.status(500).json({
      error: "Search provider is not configured"
    });
  }

  try {
    // ----------------------------------------------------------
    // 4. Ask SerpApi for Google Shopping results
    // ----------------------------------------------------------

    const params = new URLSearchParams({
      engine: "google_shopping",
      q,
      api_key: key,
      location: "India",
      hl: "en",
      device: "mobile"
    });

    const response = await fetch(
      `https://serpapi.com/search?${params.toString()}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error ||
          "Shopping search provider error"
      });
    }

    // ----------------------------------------------------------
    // 5. Helper: clean text
    // ----------------------------------------------------------

    function cleanText(value) {
      if (
        value === null ||
        value === undefined
      ) {
        return "";
      }

      return String(value)
        .replace(/\s+/g, " ")
        .trim();
    }

    // ----------------------------------------------------------
    // 6. Helper: detect original currency
    //
    // IMPORTANT:
    // We NEVER assume INR just because the user is in India.
    //
    // If SerpApi gives:
    // "$64.99"  -> USD
    // "₹5,499"  -> INR
    // "€49.99"  -> EUR
    //
    // If the currency cannot be identified safely:
    // originalCurrency = null
    // ----------------------------------------------------------

    function detectCurrency(value) {
      const text = cleanText(value);

      if (!text) {
        return null;
      }

      // ISO currency codes
      const codeMatch = text.match(
        /\b(USD|INR|EUR|GBP|AED|CAD|AUD|SGD|JPY|CNY|KRW)\b/i
      );

      if (codeMatch) {
        return codeMatch[1].toUpperCase();
      }

      // Indian Rupee
      if (
        text.includes("₹") ||
        /\bRs\.?\b/i.test(text)
      ) {
        return "INR";
      }

      // US Dollar
      if (text.includes("$")) {
        return "USD";
      }

      // Euro
      if (text.includes("€")) {
        return "EUR";
      }

      // British Pound
      if (text.includes("£")) {
        return "GBP";
      }

      // UAE Dirham
      if (
        text.includes("د.إ") ||
        /\bAED\b/i.test(text)
      ) {
        return "AED";
      }

      // Canadian Dollar
      if (text.includes("C$")) {
        return "CAD";
      }

      // Australian Dollar
      if (text.includes("A$")) {
        return "AUD";
      }

      // Singapore Dollar
      if (text.includes("S$")) {
        return "SGD";
      }

      /*
        ¥ is intentionally NOT automatically classified.
        It can represent JPY or CNY.
      */

      return null;
    }

    // ----------------------------------------------------------
    // 7. Helper: get numeric original price
    // ----------------------------------------------------------

    function getNumericPrice(item) {
      // Best case: SerpApi already gives a number.
      if (
        typeof item?.extracted_price === "number"
      ) {
        return item.extracted_price;
      }

      // Sometimes price itself can be numeric.
      if (
        typeof item?.price === "number"
      ) {
        return item.price;
      }

      // Otherwise try to extract number from price text.
      if (
        typeof item?.price === "string"
      ) {
        const cleaned = item.price
          .replace(/,/g, "");

        const match = cleaned.match(
          /-?\d+(?:\.\d+)?/
        );

        if (match) {
          return Number(match[0]);
        }
      }

      return null;
    }

    // ----------------------------------------------------------
    // 8. Helper: find the retailer's original currency
    // ----------------------------------------------------------

    function getOriginalCurrency(item) {
      const candidates = [
        item?.currency,
        item?.price,
        item?.price_text,
        item?.raw_price,
        item?.extracted_price_text,
        item?.old_price
      ];

      for (const candidate of candidates) {
        const currency =
          detectCurrency(candidate);

        if (currency) {
          return currency;
        }
      }

      return null;
    }

    // ----------------------------------------------------------
    // 9. Normalize SerpApi results into Auvra's product format
    // ----------------------------------------------------------

    const products =
      (data.shopping_results || []).map(
        (item, index) => {
          const originalPrice =
            getNumericPrice(item);

          const originalOldPrice =
            typeof item?.extracted_old_price ===
            "number"
              ? item.extracted_old_price
              : null;

          const priceText =
            cleanText(item?.price);

          const oldPriceText =
            cleanText(
              item?.old_price ||
              item?.extracted_old_price
            );

          const originalCurrency =
            getOriginalCurrency(item);

          return {
            // ------------------------------------------------
            // Product identity
            // ------------------------------------------------

            id:
              item.product_id ||
              `shopping-${index}`,

            title:
              item.title ||
              "Product",

            // ------------------------------------------------
            // ORIGINAL RETAILER PRICE
            //
            // These values must NEVER be overwritten by
            // currency conversion.
            // ------------------------------------------------

            originalPrice,

            originalOldPrice,

            originalCurrency,

            // Preserve exactly what the retailer/search
            // provider gave us where available.
            priceText,

            oldPriceText,

            // ------------------------------------------------
            // Backward compatibility
            //
            // Existing Auvra frontend code may still read
            // product.price / product.oldPrice.
            // ------------------------------------------------

            price: originalPrice,

            oldPrice: originalOldPrice,

            // ------------------------------------------------
            // Retailer information
            // ------------------------------------------------

            source:
              item.source ||
              "Retailer",

            link:
              item.product_link ||
              "",

            delivery:
              item.delivery ||
              "",

            // ------------------------------------------------
            // Product metadata
            // ------------------------------------------------

            rating:
              item.rating ??
              null,

            reviews:
              item.reviews ??
              0,

            thumbnail:
              item.thumbnail ||
              "",

            productId:
              item.product_id ||
              null
          };
        }
      );

    // ----------------------------------------------------------
    // 10. Send normalized Auvra response
    // ----------------------------------------------------------

    return res.status(200).json({
      mode: "live",

      query: q,

      /*
        IMPORTANT ARCHITECTURE CONTRACT:

        SerpApi
             ↓
        originalPrice
        originalCurrency
             ↓
        Auvra
             ↓
        user's selected currency
             ↓
        converted display price
      */

      currencyPolicy: {
        originalPricePreserved: true,
        originalCurrencyPreserved: true,
        displayCurrency:
          "controlled-by-user-profile"
      },

      products
    });

  } catch (error) {
    console.error(
      "Search provider error:",
      error
    );

    return res.status(500).json({
      error:
        "Search provider request failed"
    });
  }
};
