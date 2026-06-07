const themeBtn = document.getElementById("theme-btn");
const settingsBtn = document.getElementById("settings-btn");
const preferences = document.querySelector(".preferences");
const closePref = document.getElementById("close-pref");

const storedTheme = localStorage.getItem("theme");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";
const initialTheme = storedTheme || systemTheme;

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  themeBtn.innerText = theme === "dark" ? "light_mode" : "dark_mode";
}

applyTheme(initialTheme);

// Toggle theme on click
themeBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const target = current === "dark" ? "light" : "dark";
  applyTheme(target);
});

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  preferences.classList.toggle("active");
});

preferences.addEventListener("click", (e) => {
  e.stopPropagation();
});

closePref.addEventListener("click", () => {
  preferences.classList.remove("active");
});

window.addEventListener("click", () => {
  preferences.classList.remove("active");
});
