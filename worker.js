export default {
  async fetch(request, env) {
    // CORS headers allowing your GitHub Pages site to communicate with this worker
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight browser checks
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
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

      // Prompt tailored to output structured Scripture Scanner sections in JSON format
      const prompt = `You are a biblical study assistant mimicking the 'Scripture Scanner' app style. 
Analyze the passage: "${reference}" - "${verseText}".

Provide your response in raw JSON format (without markdown code blocks) using this exact structure:
{
  "summary": "A concise 2-3 sentence overview of the core message.",
  "historicalContext": "Historical, cultural, and authorship background.",
  "originalLanguage": [
    {"word": "Original Greek/Hebrew term", "transliteration": "English pronunciation", "meaning": "Detailed meaning and Strong's definition"}
  ],
  "crossReferences": [
    {"reference": "Book Chapter:Verse", "reason": "Brief explanation of connection"}
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
      const parsedAnalysis = JSON.parse(cleanedJsonString);

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
