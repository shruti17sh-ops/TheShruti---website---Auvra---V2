module.exports = async (req, res) => {
  // ------------------------------------------------------------
  // Only allow GET requests
  // ------------------------------------------------------------

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const from = String(req.query?.from || "")
    .trim()
    .toUpperCase();

  const to = String(req.query?.to || "")
    .trim()
    .toUpperCase();

  // ------------------------------------------------------------
  // Validate currencies
  // ------------------------------------------------------------

  if (!from || !to) {
    return res.status(400).json({
      error: "Both from and to currencies are required"
    });
  }

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return res.status(400).json({
      error: "Currency must be a 3-letter ISO code"
    });
  }

  // Same currency = no conversion required.
  if (from === to) {
    return res.status(200).json({
      from,
      to,
      rate: 1,
      source: "same-currency"
    });
  }

  try {
    // ----------------------------------------------------------
    // Frankfurter exchange-rate API
    // ----------------------------------------------------------

    const response = await fetch(
      `https://api.frankfurter.dev/v2/rate/${from}/${to}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.message ||
          data?.error ||
          `Unable to convert ${from} to ${to}`
      });
    }

    const rate = Number(data?.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(502).json({
        error: "Invalid exchange rate received"
      });
    }

    return res.status(200).json({
      from,
      to,
      rate,
      date: data?.date || null,
      source: "Frankfurter"
    });

  } catch (error) {
    console.error("FX provider error:", error);

    return res.status(500).json({
      error: "Currency conversion service failed"
    });
  }
};
