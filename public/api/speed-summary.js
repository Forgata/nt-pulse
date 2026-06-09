export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const mbps = body.mbps;

    if (!mbps) {
      return res
        .status(400)
        .json({ message: "Bad Request: Missing 'mbps' in body data." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        message:
          "Missing GEMINI_API_KEY environment variable on your production server setup.",
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `A user just tested their internet speed and got ${mbps} Mbps. In two short sentences, tell them exactly what they can comfortably do (like streaming, gaming, tiktoks, etc) and if they face any limits. Keep it short and to the point. not more than 20 words. dont suggest anything else.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error details:", errorText);
      return res.status(response.status).json({
        message: "Gemini Upstream API Error",
        details: errorText,
      });
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      return res.status(500).json({
        message: "Unexpected payload structure from Gemini API",
        received: data,
      });
    }

    const text = data.candidates[0].content.parts[0].text;

    return res.status(200).json({ summary: text });
  } catch (err) {
    console.error("Serverless caught panic:", err);
    return res.status(500).json({
      message: "Internal Catch Panic",
      error: err.message,
    });
  }
}
