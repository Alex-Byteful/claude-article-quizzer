// Runs in the active tab after lib/Readability.js. The value of the last
// expression is the result that browser.scripting.executeScript returns.
(() => {
  const clean = (s) => (s || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  let title = document.title || "";
  let text = "";
  let source = "readability";

  try {
    // Readability changes the DOM it parses, so give it a copy.
    const article = new Readability(document.cloneNode(true)).parse();
    if (article && article.textContent) {
      text = clean(article.textContent);
      title = article.title || title;
    }
  } catch (e) {
    // Fall through to innerText below.
  }

  if (!text) {
    source = "body";
    text = clean(document.body ? document.body.innerText : "");
  }

  return { title: clean(title), text, url: location.href, source };
})();
