    module.exports = async (req, res) => {

  /* =========================================================
     AUVRA LIVE SHOPPING SEARCH
     Google Shopping → Seller details → Direct retailer URL
  ========================================================= */

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const q = String(req.query?.q || "").trim();

  if (!q) {
    return res.status(400).json({
      error: "Search query is required"
    });
  }

  const key = process.env.SERPAPI_KEY;

  if (!key) {
    return res.status(500).json({
      error: "Search provider is not configured"
    });
  }


  /* =========================================================
     HELPERS
  ========================================================= */

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

    const cleaned =
      String(value || "")
        .replace(/[^0-9.,-]/g, "")
        .replace(/,(?=\d{3})/g, "");

    const number =
      Number(cleaned);

    return Number.isFinite(number)
      ? number
      : null;
  }


  function normalizeName(value) {

    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }


  function getDirectSellerLink(seller) {

    const link =
      seller?.direct_link ||
      "";

    if (!link) {
      return "";
    }

    try {

      const url =
        new URL(link);

      const hostname =
        url.hostname.toLowerCase();

      /*
        Never accept Google as the final retailer.
      */

      if (
        hostname.includes("google.com") ||
        hostname.includes("google.co.in") ||
        hostname.includes("googleusercontent.com")
      ) {
        return "";
      }

      return url.toString();

    } catch {

      return "";

    }
  }


  /* =========================================================
     GET DIRECT RETAILER OFFER
  ========================================================= */

  async function getRetailerOffer(item) {

    /*
      SerpApi gives us this URL for the
      Google Immersive Product data.
    */

    const apiUrl =
      item?.serpapi_immersive_product_api;

    if (!apiUrl) {
      return null;
    }

    try {

      const url =
        new URL(apiUrl);

      /*
        Add our private SerpApi key
        server-side.
      */

      url.searchParams.set(
        "api_key",
        key
      );

      /*
        Ask SerpApi for additional stores.
      */

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
        return null;
      }


      const sellers =
        data?.sellers_results?.online_sellers || [];


      if (!sellers.length) {
        return null;
      }


      /*
        First try to find the seller that matches
        the original Shopping result source.
      */

      const originalSource =
        normalizeName(item.source);


      let seller =
        sellers.find(
          candidate =>
            normalizeName(candidate.name) ===
            originalSource
        );


      /*
        If there isn't an exact match,
        find a close match.
      */

      if (!seller && originalSource) {

        seller =
          sellers.find(
            candidate => {

              const candidateName =
                normalizeName(candidate.name);

              return (
                candidateName.includes(originalSource) ||
                originalSource.includes(candidateName)
              );

            }
          );

      }


      /*
        Last resort:
        use the first available seller.
      */

      if (!seller) {
        seller = sellers[0];
      }


      const directLink =
        getDirectSellerLink(seller);


      if (!directLink) {
        return null;
      }


      /*
        Prefer the seller's own price when available.
      */

      const sellerPriceText =
        seller.base_price ||
        seller.price ||
        seller.original_price ||
        "";


      const sellerPrice =
        numericPrice(
          sellerPriceText
        );


      const sellerCurrency =
        detectCurrency(
          sellerPriceText
        );


      return {

        link: directLink,

        source:
          seller.name ||
          item.source ||
          "Retailer",

        price:
          sellerPrice ??
          numericPrice(item.extracted_price),

        priceText:
          sellerPriceText ||
          item.price ||
          "",

        currency:
          sellerCurrency ||
          detectCurrency(item.price),

        delivery:
          seller?.details_and_offers?.[0]?.text ||
          item.delivery ||
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


  /* =========================================================
     MAIN SEARCH
  ========================================================= */

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

      return res.status(response.status).json({

        error:
          data?.error ||
          "Shopping search provider error"

      });

    }


    const shoppingResults =
      data.shopping_results || [];


    /*
      We don't ask for direct retailer links
      for hundreds of products.

      Start with the first 10.
      This keeps the MVP reasonably fast
      and controls API usage.
    */

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
                item.extracted_price
              );


            const originalCurrency =
              retailer?.currency ||
              detectCurrency(
                item.price
              );


            /*
              IMPORTANT:
              If we don't have a direct retailer URL,
              don't use Google's product URL.
            */

            const retailerLink =
              retailer?.link || "";


            return {

              id:
                item.product_id ||
                `shopping-${index}`,

              title:
                item.title ||
                "Product",


              /*
                ORIGINAL RETAILER PRICE
              */

              originalPrice,

              originalOldPrice:
                numericPrice(
                  item.extracted_old_price
                ),


              /*
                ORIGINAL RETAILER CURRENCY
              */

              originalCurrency,


              priceText:
                retailer?.priceText ||
                item.price ||
                "",

              oldPriceText:
                item.old_price ||
                "",


              /*
                Compatibility fields
              */

              price:
                originalPrice,

              oldPrice:
                numericPrice(
                  item.extracted_old_price
                ),


              source:
                retailer?.source ||
                item.source ||
                "Retailer",


              /*
                THIS IS THE IMPORTANT PART
              */

              link:
                retailerLink,


              delivery:
                retailer?.delivery ||
                item.delivery ||
                "",


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
                "",


              /*
                Useful debugging information.
                This does NOT expose the API key.
              */

              hasDirectRetailerLink:
                Boolean(retailerLink)

            };

          }
        )

      );


    /*
      Only return products that have
      a real retailer destination.

      This prevents Auvra from accidentally
      sending users to Google.
    */

    const usableProducts =
      products.filter(
        product =>
          product.hasDirectRetailerLink
      );


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
