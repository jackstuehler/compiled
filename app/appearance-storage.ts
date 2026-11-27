// Runs before the page paints so a saved override takes effect on reload.
export const appearanceStorageKey = "compiled-appearance";

export const appearanceInitScript = `try {
  var savedAppearance = localStorage.getItem(${JSON.stringify(appearanceStorageKey)});
  if (savedAppearance === "light" || savedAppearance === "dark") {
    document.documentElement.dataset.appearance = savedAppearance;
  }
} catch {}`;
