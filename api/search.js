module.exports = async (req, res) => {

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const q = String(req.query?.q || "").trim();

  const minPrice = String(
    req.query?.min_price || ""
  ).trim();

  const maxPrice = String(
    req.query?.max_price || ""
  ).trim();

  const sortBy = String(
    req.query?.sort_by || ""
  ).trim();


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


  try {

    const params = new URLSearchParams({

      engine: "google_shopping",

      q,

      api_key: key,

      location: "India",

      hl: "en",

      device: "mobile"

    });


    /*
      Optional price filters
    */

    if (minPrice) {
      params.set(
        "min_price",
        minPrice
      );
    }


    if (maxPrice) {
      params.set(
        "max_price",
        maxPrice
      );
    }


    /*
      Optional sorting

      1 = price low → high
      2 = price high → low
    */

    if (sortBy === "1" || sortBy === "2") {

      params.set(
        "sort_by",
        sortBy
      );

    }


    const response = await fetch(
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
const products =
  (data.shopping_results || [])
    .map((item, index) => {

      const price =
        item.extracted_price ?? null;

      const oldPrice =
        item.extracted_old_price ?? null;

      let discount = null;

      if (
        price != null &&
        oldPrice != null &&
        oldPrice > price
      ) {
        discount =
          Math.round(
            ((oldPrice - price) / oldPrice) * 100
          );
      }

      return {
        id:
          item.product_id ||
          `shopping-${index}`,

        title:
          item.title ||
          "Product",

        price,

        oldPrice,

        discount,

        currency: "INR",

        source:
          item.source ||
          "Retailer",

        rating:
          item.rating ??
          null,

        reviews:
          item.reviews ??
          0,

        thumbnail:
          item.thumbnail ||
          "",

        link:
          item.product_link ||
          "",

        delivery:
          item.delivery ||
          "",

        availability:
          item.availability ||
          "",

        raw: {
          product_id:
            item.product_id ||
            null,

          source:
            item.source ||
            null
        }
      };

    });
    return res.status(200).json({

      mode: "live",

      query: q,

      filters: {

        min_price:
          minPrice || null,

        max_price:
          maxPrice || null,

        sort_by:
          sortBy || null

      },

      count:
        products.length,

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
