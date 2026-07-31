export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "Worker is running" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { reference, verseText } = await request.json();

      if (!reference || !verseText) {
        throw new Error("Missing input: reference or verseText.");
      }

      if (!env.GEMINI_API_KEY) {
        throw new Error("CRITICAL ERROR: GEMINI_API_KEY environment variable is missing in Cloudflare Settings.");
      }

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

      // Updated model target
      const modelName = "gemini-2.0-flash";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;

      console.log(`Calling Gemini API (${modelName})...`);
      const apiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error("Gemini API Error Response:", errorText);

        // Auto-diagnostic: If 404, list available models in logs
        if (apiResponse.status === 404) {
          try {
            const modelsListRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
            const modelsListData = await modelsListRes.json();
            const availableModels = modelsListData.models
              ?.filter(m => m.supportedGenerationMethods?.includes("generateContent"))
              ?.map(m => m.name) || [];
            console.log("AVAILABLE MODELS FOR YOUR KEY:", JSON.stringify(availableModels));
          } catch (listErr) {
            console.error("Could not fetch models list:", listErr.message);
          }
        }

        throw new Error(`Gemini API call failed with status ${apiResponse.status}. See logs for details.`);
      }

      const data = await apiResponse.json();
      console.log("Gemini API successful response.");

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) {
        console.error("Gemini Response Structure (data):", JSON.stringify(data, null, 2));
        throw new Error("CRITICAL ERROR: Gemini returned a successful response, but it contained no parseable analysis text.");
      }
      
      const cleanedJsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      
      let parsedAnalysis;
      try {
        parsedAnalysis = JSON.parse(cleanedJsonString);
      } catch (jsonErr) {
        console.error("Failed to parse Gemini JSON output:", cleanedJsonString);
        throw new Error("CRITICAL ERROR: Gemini returned data, but it was not valid JSON. See logs.");
      }

      return new Response(JSON.stringify(parsedAnalysis), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      console.error("Worker Crash (Caught Exception):", err.message);
      
      return new Response(JSON.stringify({ 
        error: "Internal Server Error",
        message: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
