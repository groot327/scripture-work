export default {
  async fetch(request, env) {
    // CORS headers allow your GitHub Pages site to communicate with this worker
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight browser checks
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Support GET requests just for testing the URL
    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "Worker is running" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST requests allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { reference, verseText } = await request.json();

      if (!reference || !verseText) {
        return new Response(JSON.stringify({ error: "Missing scripture input" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Updated Prompt Tailored for Scripture Scanner outputs seen in image_0.png and image_1.png
      const prompt = `You are a biblical study assistant mimicking the style and layout of the 'Scripture Scanner' app output. 

Analyze the passage: "${reference}" - "${verseText}".

Provide your response in raw JSON format (without markdown code blocks) using this exact structure:
{
  "summary": "A concise, detailed summary (2-3 sentences) of the central theme and message.",
  "popularInterpretations": [
    { "source": "Commentary Name or Author (e.g., Wiersbe Bible Commentary)", "interpretation": "Detailed, specific interpretation point from this source." },
    { "source": "Holman Bible Handbook (1992)", "interpretation": "Another detailed interpretation point." }
  ],
  "possibleTakeaways": [
    "List of actionable, spiritual takeaways for the believer.",
    "Another practical application point.",
    "A takeaway focusing on relationship with God."
  ],
  "interestingFact": "One compelling, unique historical, linguistic, or cultural fact about this specific verse.",
  "relatedVerses": [
    { "reference": "Book Chapter:Verse", "reason": "Explanation of thematic connection." },
    { "reference": "Another Book Chapter:Verse", "reason": "Another cross-reference connection." }
  ]
}`;

      // Call Google Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

      const apiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        return new Response(JSON.stringify({ error: "Gemini API error", details: errText }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const data = await apiResponse.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      
      // Clean up markdown code fences if Gemini returns them
      const cleanedJsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      
      // Try to parse the response to validate it
      let parsedAnalysis;
      try {
        parsedAnalysis = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error("Gemini did not return valid JSON analysis.");
      }

      return new Response(JSON.stringify(parsedAnalysis), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
