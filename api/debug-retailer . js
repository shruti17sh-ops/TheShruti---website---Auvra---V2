module.exports = async (req, res) => {
  const key = process.env.SERPAPI_KEY;

  if (!key) {
    return res.status(500).json({
      error: "SERPAPI_KEY missing"
    });
  }

  const q = String(req.query?.q || "headphones").trim();

  try {
    const searchUrl = new URL(
      "https://serpapi.com/search"
    );

    searchUrl.searchParams.set(
      "engine",
      "google_shopping"
    );

    searchUrl.searchParams.set(
      "q",
      q
    );

    searchUrl.searchParams.set(
      "api_key",
      key
    );

    searchUrl.searchParams.set(
      "location",
      "India"
    );

    searchUrl.searchParams.set(
      "hl",
      "en"
    );

    const searchResponse = await fetch(
      searchUrl.toString()
    );

    const searchData =
      await searchResponse.json();

    const item =
      searchData?.shopping_results?.[0];

    if (!item) {
      return res.status(200).json({
        step: "shopping-search",
        result: "NO SHOPPING RESULT"
      });
    }

    const immersiveUrl =
      item.serpapi_immersive_product_api;

    if (!immersiveUrl) {
      return res.status(200).json({
        step: "immersive-url",
        result: "NO IMMERSIVE URL",
        product: {
          title: item.title,
          source: item.source,
          product_link: item.product_link
        }
      });
    }

    const productUrl =
      new URL(immersiveUrl);

    productUrl.searchParams.set(
      "api_key",
      key
    );

    productUrl.searchParams.set(
      "more_stores",
      "true"
    );

    const productResponse =
      await fetch(
        productUrl.toString()
      );

    const productData =
      await productResponse.json();

    return res.status(200).json({
      step: "immersive-product",
      httpStatus: productResponse.status,
      product: {
        title: item.title,
        source: item.source
      },
      sellers:
        productData?.sellers_results
          ?.online_sellers || [],
      providerError:
        productData?.error ||
        productData?.message ||
        null
    });

  } catch (error) {

    return res.status(500).json({
      step: "exception",
      error: error.message
    });
  }
};
