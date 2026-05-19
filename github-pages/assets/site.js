(() => {
  const starTargets = document.querySelectorAll("[data-github-stars]");
  if (!starTargets.length) return;

  const formatStars = (count) => {
    if (!Number.isFinite(count)) return "5";
    if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
    return String(count);
  };

  fetch("https://api.github.com/repos/flik-lab/layang", {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((repo) => {
      const stars = formatStars(repo?.stargazers_count);
      starTargets.forEach((target) => {
        target.textContent = stars;
      });
    })
    .catch(() => {
      starTargets.forEach((target) => {
        target.textContent = "5";
      });
    });
})();
