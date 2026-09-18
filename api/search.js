module.exports = async (req, res) => {
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

  try {
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
        error: data?.error || "Shopping search provider error"
      });
    }

    const products = (data.shopping_results || []).map(
      (item, index) => ({
        id: item.product_id || `shopping-${index}`,
        title: item.title || "Product",
        price: item.extracted_price ?? null,
        oldPrice: item.extracted_old_price ?? null,
        source: item.source || "Retailer",
        rating: item.rating ?? null,
        reviews: item.reviews ?? 0,
        thumbnail: item.thumbnail || "",
        link: item.product_link || "",
        delivery: item.delivery || ""
      })
    );

    return res.status(200).json({
      mode: "live",
      query: q,
      products
    });

  } catch (error) {

    console.error("Search provider error:", error);

    return res.status(500).json({
      error: "Search provider request failed"
    });
  }
};
