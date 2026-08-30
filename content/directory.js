const form = document.querySelector("#speciesFilters");

if (form) {
  const cards = [...document.querySelectorAll("[data-species-card]")];
  const groups = [...document.querySelectorAll("[data-species-group]")];
  const search = form.querySelector("#speciesSearch");
  const quality = form.querySelector("#qualityFilter");
  const month = form.querySelector("#monthFilter");
  const clear = form.querySelector("#clearFilters");
  const resultCount = form.querySelector("#resultCount");
  const empty = document.querySelector("#emptyDirectory");
  const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ca").trim();

  const readQuery = () => {
    const params = new URLSearchParams(location.search);
    const groupValue = params.get("grup");
    const groupInput = form.querySelector(`input[name="group"][value="${groupValue}"]`);
    if (groupInput) groupInput.checked = true;
    search.value = params.get("q") || "";
    if ([...quality.options].some((option) => option.value === params.get("valoracio"))) quality.value = params.get("valoracio");
    if ([...month.options].some((option) => option.value === params.get("mes"))) month.value = params.get("mes");
  };

  const updateQuery = ({ query, group, qualityValue, monthValue }) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (group !== "all") params.set("grup", group);
    if (qualityValue !== "all") params.set("valoracio", qualityValue);
    if (monthValue !== "all") params.set("mes", monthValue);
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  };

  const applyFilters = () => {
    const query = normalize(search.value);
    const group = form.querySelector('input[name="group"]:checked')?.value || "all";
    const qualityValue = quality.value;
    const monthValue = month.value;
    let visibleCount = 0;

    for (const card of cards) {
      const matches = (!query || normalize(card.dataset.search).includes(query))
        && (group === "all" || card.dataset.group === group)
        && (qualityValue === "all" || card.dataset.quality === qualityValue)
        && (monthValue === "all" || card.dataset.months.split(",").includes(monthValue));
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    }

    for (const section of groups) {
      const visibleCards = [...section.querySelectorAll("[data-species-card]")].filter((card) => !card.hidden);
      section.hidden = visibleCards.length === 0;
      const count = section.querySelector("[data-group-count]");
      if (count) count.textContent = String(visibleCards.length);
    }

    resultCount.textContent = `${visibleCount} ${visibleCount === 1 ? "fitxa" : "fitxes"}`;
    empty.hidden = visibleCount !== 0;
    clear.hidden = !query && group === "all" && qualityValue === "all" && monthValue === "all";
    updateQuery({ query: search.value.trim(), group, qualityValue, monthValue });
  };

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", applyFilters);
  form.addEventListener("change", applyFilters);
  clear.addEventListener("click", () => {
    form.reset();
    search.value = "";
    applyFilters();
    search.focus();
  });

  readQuery();
  applyFilters();
}
