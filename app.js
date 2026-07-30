// REPLACE THIS URL WITH YOUR CLOUDFLARE WORKER URL
const WORKER_URL = "https://scripture-proxy.groot327.workers.dev";

let currentDaily = { reference: "", text: "" };

document.addEventListener("DOMContentLoaded", () => {
  fetchDailyVerse();

  document.getElementById("lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.getElementById("verse-input").value.trim();
    if (query) handleSearch(query);
  });

  document.getElementById("analyze-daily-btn").addEventListener("click", () => {
    if (currentDaily.reference) {
      displayPassage(currentDaily.reference, currentDaily.text);
      fetchGeminiInsights(currentDaily.reference, currentDaily.text);
    }
  });
});

// 1. Fetch Verse of the Day (OurManna API)
async function fetchDailyVerse() {
  try {
    const res = await fetch("https://beta.ourmanna.com/api/v1/get?format=json&order=daily");
    const data = await res.json();
    
    currentDaily.reference = data.verse.details.reference;
    currentDaily.text = data.verse.details.text;

    document.getElementById("daily-ref").innerText = currentDaily.reference;
    document.getElementById("daily-text").innerText = `"${currentDaily.text}"`;
    document.getElementById("analyze-daily-btn").style.display = "inline-block";
  } catch (err) {
    document.getElementById("daily-ref").innerText = "John 3:16";
    document.getElementById("daily-text").innerText = '"For God so loved the world..."';
    currentDaily = { reference: "John 3:16", text: "For God so loved the world..." };
    document.getElementById("analyze-daily-btn").style.display = "inline-block";
  }
}

// 2. Lookup Custom Verse (Bible-API.com)
async function handleSearch(query) {
  showLoading(true);
  hideResults();

  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Passage not found. Try 'John 3:16' format.");

    const data = await res.json();
    const reference = data.reference;
    const text = data.text.trim();

    displayPassage(reference, text);
    await fetchGeminiInsights(reference, text);
  } catch (err) {
    alert(err.message);
    showLoading(false);
  }
}

// 3. Display Scanned Passage Header
function displayPassage(reference, text) {
  document.getElementById("passage-ref").innerText = reference;
  document.getElementById("passage-text").innerText = `"${text}"`;
  document.getElementById("passage-container").classList.remove("hidden");
}

// 4. Send Passage to Cloudflare Proxy for Gemini Insights
async function fetchGeminiInsights(reference, verseText) {
  showLoading(true);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, verseText })
    });

    if (!response.ok) throw new Error("Unable to fetch insights.");

    const insights = await response.json();
    renderInsights(insights);
  } catch (err) {
    alert("Error loading insights: " + err.message);
  } finally {
    showLoading(false);
  }
}

// 5. Render Structured Insights Output
function renderInsights(data) {
  document.getElementById("res-summary").innerText = data.summary || "No summary available.";
  document.getElementById("res-history").innerText = data.historicalContext || "No context available.";

  // Words breakdown
  const wordContainer = document.getElementById("res-language");
  wordContainer.innerHTML = "";
  if (data.originalLanguage && Array.isArray(data.originalLanguage)) {
    data.originalLanguage.forEach(item => {
      const div = document.createElement("div");
      div.className = "word-item";
      div.innerHTML = `
        <div class="word-title">${item.word} (<em>${item.transliteration}</em>)</div>
        <div class="word-meaning">${item.meaning}</div>
      `;
      wordContainer.appendChild(div);
    });
  }

  // Cross references
  const crossRefContainer = document.getElementById("res-cross-ref");
  crossRefContainer.innerHTML = "";
  if (data.crossReferences && Array.isArray(data.crossReferences)) {
    data.crossReferences.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ref-tag">${item.reference}:</span> ${item.reason}`;
      crossRefContainer.appendChild(li);
    });
  }

  document.getElementById("results-container").classList.remove("hidden");
}

function showLoading(isLoading) {
  const spinner = document.getElementById("loading-spinner");
  if (isLoading) spinner.classList.remove("hidden");
  else spinner.classList.add("hidden");
}

function hideResults() {
  document.getElementById("results-container").classList.add("hidden");
}
