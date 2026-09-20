module.exports = async (req, res) => {

  /*
   * ============================================================
   * AUVRA LIVE SHOPPING SEARCH
   *
   * Google Shopping
   *       ↓
   * Immersive Product / Seller data
   *       ↓
   * Direct retailer URL
   *       ↓
   * Auvra frontend
   *
   * IMPORTANT:
   * We NEVER intentionally use Google's product page as
   * the user's purchase destination.
   * ============================================================
   */


  // ------------------------------------------------------------
  // METHOD CHECK
  // ------------------------------------------------------------

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }


  // ------------------------------------------------------------
  // SEARCH QUERY
  // ------------------------------------------------------------

  const q = String(req.query?.q || "").trim();

  if (!q) {
    return res.status(400).json({
      error: "Search query is required"
    });
  }


  // ------------------------------------------------------------
  // SERPAPI KEY
  // ------------------------------------------------------------

  const key = process.env.SERPAPI_KEY;

  if (!key) {
    return res.status(500).json({
      error: "Search provider is not configured"
    });
  }


  // ============================================================
  // HELPERS
  // ============================================================

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


  /*
   * Google sometimes returns:
   *
   * https://www.google.com/url?q=https://retailer.com/product...
   *
   * We unwrap the q parameter.
   *
   * We NEVER return a Google URL.
   */

  function unwrapRetailerLink(value) {

    const raw = String(value || "").trim();

    if (!raw) {
      return "";
    }

    try {

      const url = new URL(raw);

      const hostname =
        url.hostname.toLowerCase();


      // --------------------------------------------------------
      // GOOGLE REDIRECT
      // --------------------------------------------------------

      if (
        hostname === "www.google.com" ||
        hostname === "google.com" ||
        hostname.endsWith(".google.com") ||
        hostname === "www.google.co.in" ||
        hostname === "google.co.in"
      ) {

        const qParam =
          url.searchParams.get("q") ||
          url.searchParams.get("url");

        if (!qParam) {
          return "";
        }

        return unwrapRetailerLink(
          qParam
        );
      }


      // --------------------------------------------------------
      // BLOCK GOOGLE / SERPAPI
      // --------------------------------------------------------

      if (
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


  // ============================================================
  // FETCH IMMERSIVE PRODUCT / SELLER DATA
  // ============================================================

  async function getRetailerOffer(item) {

    let apiUrl =
      item?.serpapi_immersive_product_api || "";


    /*
     * If SerpApi gave us the immersive endpoint,
     * use it directly.
     */

    if (!apiUrl) {
      return null;
    }


    try {

      const url =
        new URL(apiUrl);


      // Make absolutely sure our API key is attached.
      url.searchParams.set(
        "api_key",
        key
      );


      // Ask SerpApi for more retailer stores.
      url.searchParams.set(
        "more_stores",
        "true"
      );


      const response =
        await fetch(
          url.toString()
        );


      const data =
        await response.json();


      if (!response.ok) {

        console.warn(
          "Immersive product request failed:",
          response.status
        );

        return null;
      }


      /*
       * Current SerpApi structure:
       *
       * sellers_results:
       *   online_sellers: [...]
       */

      const sellers =
        data?.sellers_results?.online_sellers || [];


      if (!Array.isArray(sellers) || !sellers.length) {
        return null;
      }


      // --------------------------------------------------------
      // TRY TO MATCH THE ORIGINAL SHOPPING SOURCE
      // --------------------------------------------------------

      const originalSource =
        normalizeName(item?.source);


      let seller =
        sellers.find(candidate => {

          return (
            normalizeName(candidate?.name) ===
            originalSource
          );

        });


      // Partial match if exact match failed.

      if (!seller && originalSource) {

        seller =
          sellers.find(candidate => {

            const candidateName =
              normalizeName(candidate?.name);

            return (
              candidateName.includes(originalSource) ||
              originalSource.includes(candidateName)
            );

          });

      }


      /*
       * If the original seller isn't available,
       * use the first seller that has a genuine
       * retailer URL.
       */

      if (!seller) {

        seller =
          sellers.find(candidate => {

            return Boolean(
              unwrapRetailerLink(
                candidate?.direct_link
              ) ||
              unwrapRetailerLink(
                candidate?.link
              )
            );

          });

      }


      if (!seller) {
        return null;
      }


      // --------------------------------------------------------
      // DIRECT RETAILER URL
      // --------------------------------------------------------

      const directLink =
        unwrapRetailerLink(
          seller?.direct_link
        ) ||
        unwrapRetailerLink(
          seller?.link
        );


      if (!directLink) {
        return null;
      }


      // --------------------------------------------------------
      // PRICE
      // --------------------------------------------------------

      const sellerPriceText =
        seller?.base_price ||
        seller?.price ||
        seller?.original_price ||
        "";


      const sellerPrice =
        numericPrice(
          sellerPriceText
        );


      const sellerCurrency =
        detectCurrency(
          sellerPriceText
        );


      // --------------------------------------------------------
      // RETURN NORMALIZED RETAILER OFFER
      // --------------------------------------------------------

      return {

        link:
          directLink,

        source:
          seller?.name ||
          item?.source ||
          "Retailer",

        price:
          sellerPrice ??
          numericPrice(
            item?.extracted_price
          ),

        priceText:
          sellerPriceText ||
          item?.price ||
          "",

        currency:
          sellerCurrency ||
          detectCurrency(
            item?.price
          ),

        delivery:
          seller?.details_and_offers?.[0]?.text ||
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


  // ============================================================
  // MAIN SEARCH
  // ============================================================

  try {

    const params =
      new URLSearchParams({

        engine:
          "google_shopping",

        q,

        api_key:
          key,

        location:
          "India",

        hl:
          "en",

        device:
          "mobile"

      });


    const response =
      await fetch(
        `https://serpapi.com/search?${params.toString()}`
      );


    const data =
      await response.json();


    if (!response.ok) {

      return res.status(
        response.status
      ).json({

        error:
          data?.error ||
          "Shopping search provider error"

      });

    }


    // ----------------------------------------------------------
    // SHOPPING RESULTS
    // ----------------------------------------------------------

    const shoppingResults =
      Array.isArray(
        data?.shopping_results
      )
        ? data.shopping_results
        : [];


    /*
     * We process the first 10 results.
     *
     * This keeps the number of additional
     * immersive-product requests reasonable.
     */

    const candidates =
      shoppingResults.slice(0, 10);


    // ----------------------------------------------------------
    // NORMALIZE PRODUCTS
    // ----------------------------------------------------------

    const products =
      await Promise.all(

        candidates.map(
          async (item, index) => {

            const retailer =
              await getRetailerOffer(
                item
              );


            const originalPrice =
              retailer?.price ??
              numericPrice(
                item?.extracted_price
              );


            const originalCurrency =
              retailer?.currency ||
              detectCurrency(
                item?.price
              );


            const retailerLink =
              retailer?.link || "";


            return {

              id:
                item?.product_id ||
                `shopping-${index}`,

              title:
                item?.title ||
                "Product",


              // ------------------------------------------------
              // ORIGINAL RETAILER PRICE
              // ------------------------------------------------

              originalPrice,

              originalOldPrice:
                numericPrice(
                  item?.extracted_old_price
                ),

              originalCurrency,


              // ------------------------------------------------
              // DISPLAY TEXT
              // ------------------------------------------------

              priceText:
                retailer?.priceText ||
                item?.price ||
                "",

              oldPriceText:
                item?.old_price ||
                "",


              // Backward-compatible fields
              price:
                originalPrice,

              oldPrice:
                numericPrice(
                  item?.extracted_old_price
                ),


              // ------------------------------------------------
              // RETAILER
              // ------------------------------------------------

              source:
                retailer?.source ||
                item?.source ||
                "Retailer",


              /*
               * IMPORTANT:
               *
               * This is now the ACTUAL retailer URL,
               * not Google's product page.
               */

              link:
                retailerLink,


              delivery:
                retailer?.delivery ||
                item?.delivery ||
                "",


              // ------------------------------------------------
              // PRODUCT INFO
              // ------------------------------------------------

              rating:
                item?.rating ??
                null,

              reviews:
                item?.reviews ??
                0,

              thumbnail:
                item?.thumbnail ||
                "",

              productId:
                item?.product_id ||
                "",


              // ------------------------------------------------
              // SAFETY FLAG
              // ------------------------------------------------

              hasDirectRetailerLink:
                Boolean(
                  retailerLink
                )

            };

          }
        )

      );


    // ----------------------------------------------------------
    // ONLY RETURN PRODUCTS WITH REAL RETAILER LINKS
    // ----------------------------------------------------------

    const usableProducts =
      products.filter(
        product =>
          product.hasDirectRetailerLink
      );


    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({

      mode:
        "live",

      query:
        q,


      currencyPolicy: {

        originalPricePreserved:
          true,

        originalCurrencyPreserved:
          true,

        displayCurrency:
          "controlled-by-user-profile"

      },


      retailerPolicy: {

        directRetailerLinksOnly:
          true,

        googleProductLinksAllowed:
          false

      },


      products:
        usableProducts

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

};
