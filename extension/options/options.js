const form = document.getElementById("form");
const keyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const toggle = document.getElementById("toggleKey");
const status = document.getElementById("status");

loadSettings().then(({ apiKey, model }) => {
  keyInput.value = apiKey;
  modelInput.value = model;
});

toggle.addEventListener("click", () => {
  const hidden = keyInput.type === "password";
  keyInput.type = hidden ? "text" : "password";
  toggle.textContent = hidden ? "Hide" : "Show";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveSettings({ apiKey: keyInput.value, model: modelInput.value });
  const saved = await loadSettings();
  modelInput.value = saved.model;
  status.textContent = saved.apiKey ? "Saved. Open the toolbar button on an article to start a quiz." : "Saved, but the API key is empty.";
});
