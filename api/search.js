   module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = String(req.query?.q || "").trim();
  const key = process.env.SERPAPI_KEY;

  if (!q) {
    return res.status(400).json({ error: "Search query is required" });
  }

  if (!key) {
    return res.status(500).json({
      error: "Search provider is not configured"
    });
  }

  function detectCurrency(value) {
    const raw = String(value || "");

    if (/₹|INR/i.test(raw)) return "INR";
    if (/A\$|AUD/i.test(raw)) return "AUD";
    if (/C\$|CAD/i.test(raw)) return "CAD";
    if (/S\$|SGD/i.test(raw)) return "SGD";
    if (/AED/i.test(raw)) return "AED";
    if (/€|EUR/i.test(raw)) return "EUR";
    if (/£|GBP/i.test(raw)) return "GBP";
    if (/\$|USD/i.test(raw)) return "USD";

    return null;
  }

  function numericPrice(value) {
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    const cleaned = String(value || "")
      .replace(/[^0-9.,-]/g, "")
      .replace(/,(?=\d{3})/g, "");

    const number = Number(cleaned);

    return Number.isFinite(number)
      ? number
      : null;
  }

  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function cleanRetailerLink(value) {
    const raw = String(value || "").trim();

    if (!raw) return "";

    try {
      const url = new URL(raw);

      const hostname =
        url.hostname.toLowerCase();

      // Google redirect → extract actual retailer
      if (
        hostname === "google.com" ||
        hostname === "www.google.com" ||
        hostname === "google.co.in" ||
        hostname === "www.google.co.in"
      ) {
        const target =
          url.searchParams.get("q") ||
          url.searchParams.get("url");

        return target
          ? cleanRetailerLink(target)
          : "";
      }

      // Never use Google / SerpApi as retailer
      if (
        hostname.includes("google.") ||
        hostname.includes("googleusercontent.com") ||
        hostname.includes("serpapi.com")
      ) {
        return "";
      }

      return url.toString();

    } catch {
      return "";
    }
  }

  async function getRetailerOffer(item) {
    const apiUrl =
      item?.serpapi_immersive_product_api;

    if (!apiUrl) return null;

    try {
      const url = new URL(apiUrl);

      url.searchParams.set("api_key", key);
      url.searchParams.set("more_stores", "true");

      const response =
        await fetch(url.toString());

      const data =
        await response.json();

      if (!response.ok) {
        return null;
      }

      /*
       * CURRENT SERPAPI STRUCTURE
       *
       * product_results.stores
       */
      const stores =
        Array.isArray(
          data?.product_results?.stores
        )
          ? data.product_results.stores
          : [];

      /*
       * FALLBACK STRUCTURE
       *
       * sellers_results.online_sellers
       */
      const sellers =
        Array.isArray(
          data?.sellers_results?.online_sellers
        )
          ? data.sellers_results.online_sellers
          : [];

      const offers = [
        ...stores,
        ...sellers
      ];

      if (!offers.length) {
        return null;
      }

      const originalSource =
        normalizeName(item?.source);

      let offer =
        offers.find(candidate => {
          return (
            normalizeName(candidate?.name) ===
            originalSource
          );
        });

      if (!offer && originalSource) {
        offer =
          offers.find(candidate => {
            const name =
              normalizeName(candidate?.name);

            return (
              name.includes(originalSource) ||
              originalSource.includes(name)
            );
          });
      }

      if (!offer) {
        offer =
          offers.find(candidate => {
            return Boolean(
              cleanRetailerLink(
                candidate?.direct_link
              ) ||
              cleanRetailerLink(
                candidate?.link
              )
            );
          });
      }

      if (!offer) return null;

      const link =
        cleanRetailerLink(
          offer?.direct_link
        ) ||
        cleanRetailerLink(
          offer?.link
        );

      if (!link) return null;

      const priceText =
        offer?.base_price ||
        offer?.price ||
        offer?.original_price ||
        "";

      return {
        link,

        source:
          offer?.name ||
          item?.source ||
          "Retailer",

        price:
          numericPrice(priceText) ??
          numericPrice(item?.extracted_price),

        priceText,

        currency:
          detectCurrency(priceText) ||
          detectCurrency(item?.price),

        delivery:
          offer?.details_and_offers?.[0]?.text ||
          item?.delivery ||
          ""
      };

    } catch (error) {
      console.warn(
        "Retailer lookup failed:",
        error?.message
      );

      return null;
    }
  }

  try {
    const params = new URLSearchParams({
      engine: "google_shopping",
      q,
      api_key: key,
      location: "India",
      hl: "en",
      device: "mobile"
    });

    const response =
      await fetch(
        `https://serpapi.com/search?${params.toString()}`
      );

    const data =
      await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error ||
          "Shopping search provider error"
      });
    }

    const shoppingResults =
      Array.isArray(data?.shopping_results)
        ? data.shopping_results
        : [];

    const candidates =
      shoppingResults.slice(0, 10);

    const products =
      await Promise.all(
        candidates.map(
          async (item, index) => {

            const retailer =
              await getRetailerOffer(item);

            const originalPrice =
              retailer?.price ??
              numericPrice(
                item?.extracted_price
              );

            const originalCurrency =
              retailer?.currency ||
              detectCurrency(item?.price);

            const retailerLink =
              retailer?.link || "";

            return {
              id:
                item?.product_id ||
                `shopping-${index}`,

              title:
                item?.title ||
                "Product",

              originalPrice,

              originalOldPrice:
                numericPrice(
                  item?.extracted_old_price
                ),

              originalCurrency,

              priceText:
                retailer?.priceText ||
                item?.price ||
                "",

              oldPriceText:
                item?.old_price ||
                "",

              price:
                originalPrice,

              oldPrice:
                numericPrice(
                  item?.extracted_old_price
                ),

              source:
                retailer?.source ||
                item?.source ||
                "Retailer",

              /*
               * IMPORTANT:
               * Only the direct retailer URL goes here.
               */
              link:
                retailerLink,

              delivery:
                retailer?.delivery ||
                item?.delivery ||
                "",

              rating:
                item?.rating ?? null,

              reviews:
                item?.reviews ?? 0,

              thumbnail:
                item?.thumbnail || "",

              productId:
                item?.product_id || "",

              hasDirectRetailerLink:
                Boolean(retailerLink)
            };
          }
        )
      );

    /*
     * IMPORTANT:
     *
     * DO NOT delete products just because
     * a direct retailer link wasn't found.
     *
     * Auvra can display them, but they
     * cannot be sent through affiliate
     * checkout until a retailer URL exists.
     */
    return res.status(200).json({
      mode: "live",

      query: q,

      currencyPolicy: {
        originalPricePreserved: true,
        originalCurrencyPreserved: true,
        displayCurrency:
          "controlled-by-user-profile"
      },

      retailerPolicy: {
        directRetailerLinksOnly: true,
        googleProductLinksAllowed: false
      },

      products
    });

  } catch (error) {
    console.error(
      "Auvra search error:",
      error
    );

    return res.status(500).json({
      error:
        "Shopping search request failed"
    });
  }
}
