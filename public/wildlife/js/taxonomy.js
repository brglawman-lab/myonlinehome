/* taxonomy.js
 * Groups a flat species list into Class > Order > Family and renders it as
 * a collapsible tree into #taxonomy-tree. Selection and expand state are
 * kept simple: the DOM is rebuilt on every filter change, but a node stays
 * expanded/collapsed across rebuilds via the `expandedKeys` set.
 */
const Taxonomy = (() => {
  const CLASS_LABELS = {
    Mammalia: "Mammals",
    Aves: "Birds",
    Reptilia: "Reptiles",
    Amphibia: "Amphibians",
  };
  const CLASS_ORDER = ["Mammalia", "Aves", "Reptilia", "Amphibia"];

  let expandedKeys = new Set();
  let onSelect = () => {};
  let selectedId = null;
  let seenChecker = () => false;

  function buildTree(list) {
    const tree = {};
    for (const sp of list) {
      tree[sp.class] ??= {};
      tree[sp.class][sp.order] ??= {};
      tree[sp.class][sp.order][sp.family] ??= [];
      tree[sp.class][sp.order][sp.family].push(sp);
    }
    return tree;
  }

  function countSeen(list) {
    return list.filter((s) => seenChecker(s.id)).length;
  }

  function makeHeader(label, key, seenCount, total) {
    const header = document.createElement("div");
    header.className = "tx-header";
    header.innerHTML = `<span class="tx-header__caret">&#9660;</span><span>${label}</span><span class="tx-header__count">${seenCount}/${total}</span>`;
    header.addEventListener("click", () => {
      const node = header.parentElement;
      node.classList.toggle("collapsed");
      if (node.classList.contains("collapsed")) expandedKeys.delete(key);
      else expandedKeys.add(key);
    });
    return header;
  }

  function speciesRow(sp) {
    const row = document.createElement("div");
    row.className = "species-row" + (seenChecker(sp.id) ? " seen" : "");
    if (sp.id === selectedId) row.classList.add("selected");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.dataset.id = sp.id;

    const dot = document.createElement("span");
    dot.className = "species-row__dot";
    const name = document.createElement("span");
    name.className = "species-row__name";
    name.textContent = sp.commonName;
    row.append(dot, name);

    if (sp.occurrenceStatus && sp.occurrenceStatus !== "resident") {
      const badge = document.createElement("span");
      badge.className = "species-row__badge";
      badge.textContent = sp.occurrenceStatus;
      row.append(badge);
    }

    const activate = () => onSelect(sp.id);
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    return row;
  }

  function render(list, opts = {}) {
    if (opts.onSelect) onSelect = opts.onSelect;
    if (opts.seenChecker) seenChecker = opts.seenChecker;
    if (opts.selectedId !== undefined) selectedId = opts.selectedId;

    const container = document.getElementById("taxonomy-tree");
    container.innerHTML = "";
    const tree = buildTree(list);

    for (const cls of CLASS_ORDER) {
      if (!tree[cls]) continue;
      const classList = list.filter((s) => s.class === cls);
      const classKey = `class:${cls}`;
      const classNode = document.createElement("div");
      classNode.className = "tx-node tx-class" + (expandedKeys.has(classKey) ? "" : " collapsed");
      if (!expandedKeys.has(classKey) && !opts.defaultCollapsed) {
        // default: classes start expanded on first ever render
      }
      classNode.append(makeHeader(CLASS_LABELS[cls] || cls, classKey, countSeen(classList), classList.length));

      const classChildren = document.createElement("div");
      classChildren.className = "tx-children";

      const orders = Object.keys(tree[cls]).sort();
      for (const order of orders) {
        const orderList = classList.filter((s) => s.order === order);
        const orderKey = `order:${cls}:${order}`;
        const orderNode = document.createElement("div");
        orderNode.className = "tx-node tx-order" + (expandedKeys.has(orderKey) ? "" : " collapsed");
        orderNode.append(makeHeader(titleCaseOrder(order), orderKey, countSeen(orderList), orderList.length));

        const orderChildren = document.createElement("div");
        orderChildren.className = "tx-children";

        const families = Object.keys(tree[cls][order]).sort();
        for (const family of families) {
          const famSpecies = tree[cls][order][family].sort((a, b) => a.commonName.localeCompare(b.commonName));
          const famKey = `family:${cls}:${order}:${family}`;

          if (families.length === 1 && famSpecies.length <= 8) {
            // Skip the redundant family layer for small single-family orders
            for (const sp of famSpecies) orderChildren.append(speciesRow(sp));
            continue;
          }

          const famNode = document.createElement("div");
          famNode.className = "tx-node tx-family" + (expandedKeys.has(famKey) ? "" : " collapsed");
          famNode.append(makeHeader(family, famKey, countSeen(famSpecies), famSpecies.length));
          const famChildren = document.createElement("div");
          famChildren.className = "tx-children";
          for (const sp of famSpecies) famChildren.append(speciesRow(sp));
          famNode.append(famChildren);
          orderChildren.append(famNode);
        }
        orderNode.append(orderChildren);
        classChildren.append(orderNode);
      }
      classNode.append(classChildren);
      container.append(classNode);
    }

    const summary = document.getElementById("tree-summary");
    if (summary) {
      summary.textContent = `${countSeen(list)} of ${list.length} species logged`;
    }
  }

  function titleCaseOrder(order) {
    if (order === order.toUpperCase()) {
      return order.charAt(0) + order.slice(1).toLowerCase();
    }
    return order;
  }

  function expandAll(list) {
    const tree = buildTree(list);
    expandedKeys = new Set();
    for (const cls of Object.keys(tree)) {
      expandedKeys.add(`class:${cls}`);
      for (const order of Object.keys(tree[cls])) {
        expandedKeys.add(`order:${cls}:${order}`);
        for (const family of Object.keys(tree[cls][order])) {
          expandedKeys.add(`family:${cls}:${order}:${family}`);
        }
      }
    }
  }

  function collapseAll() {
    expandedKeys = new Set();
  }

  function expandDefaults(list) {
    // Expand every class by default so the tree isn't empty-looking on load.
    for (const sp of list) expandedKeys.add(`class:${sp.class}`);
  }

  return { render, expandAll, collapseAll, expandDefaults };
})();
