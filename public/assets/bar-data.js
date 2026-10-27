/* The house bar — one list shared by /recipes/bar-stock/ (what's in) and the
 * guest menu at /recipes/cocktail-menu/ (what can be made tonight).
 *
 * STOCK: the checklist. Item ids are what /api/bar-stock stores, so don't
 * rename one without moving its row in the database too. `uses` is the line
 * shown under the item; `label` is how a guest note names it ("Out of dry
 * vermouth"); `homemade` items are left out of "Add missing to shopping list".
 *
 * DRINKS: the menu. `needs` lists what a drink can't be made without — leave
 * out garnishes and anything optional (ice is assumed). A need is an item id,
 * or {any: [...], label} when one of several will do; an alternative inside
 * `any` can itself be an array of ids that are all required.
 *
 * Usage: <script src="/assets/bar-data.js"></script> → window.BAR
 */
(function () {
  const STOCK = [
    { title: "Spirits", note: "Six bottles. These keep indefinitely once opened.", items: [
      { id: "gin", name: "London dry gin", label: "gin", uses: "Negroni, Martini, Gimlet, Tom Collins, Last Word, French 75, Martinez, Bijou, Bee's Knees, White Lady, Alexander" },
      { id: "vodka", name: "Vodka", label: "vodka", uses: "Martini, Cosmopolitan, Bloody Mary, Espresso Martini, White Russian, Black Russian, Chocolate Martini" },
      { id: "tequila", name: "Blanco tequila", label: "tequila", uses: "Margarita, Paloma, Rosita" },
      { id: "bourbon", name: "Bourbon", label: "bourbon", uses: "Old Fashioned, Manhattan, Whisky Sour, Boulevardier, Paper Plane, Gold Rush, Monte Carlo, Frisco Sour" },
      { id: "scotch", name: "Scotch whisky (Glen Moray 12 works)", label: "Scotch", uses: "Old Fashioned, Rob Roy, Bobby Burns, Penicillin" },
      { id: "islay", name: "Islay single malt", label: "Islay whisky", uses: "Penicillin (float on top)" },
    ]},
    { title: "Liqueurs & Aperitifs", note: "Shelf-stable. The Chartreuse and Nonino last for years at these quantities.", items: [
      { id: "cointreau", name: "Cointreau", label: "Cointreau", uses: "Margarita, Cosmopolitan, White Lady" },
      { id: "campari", name: "Campari", label: "Campari", uses: "Negroni, Boulevardier, Americano, Negroni Sbagliato, Rosita" },
      { id: "aperol", name: "Aperol", label: "Aperol", uses: "Aperol Spritz, Paper Plane" },
      { id: "nonino", name: "Amaro Nonino", label: "Amaro Nonino", uses: "Paper Plane" },
      { id: "chartreuse", name: "Green Chartreuse", label: "green Chartreuse", uses: "Last Word, Bijou" },
      { id: "maraschino", name: "Maraschino liqueur", label: "maraschino", uses: "Last Word, Martinez" },
      { id: "coffee-liqueur", name: "Coffee liqueur", label: "coffee liqueur", uses: "Espresso Martini, White Russian, Black Russian" },
      { id: "benedictine", name: "Bénédictine", label: "Bénédictine", uses: "Bobby Burns, Monte Carlo, Frisco Sour" },
      { id: "cacao", name: "Crème de cacao (Bols Cacao Brown)", label: "crème de cacao", uses: "Alexander, Chocolate Martini" },
    ]},
    { title: "Vermouth & Sparkling", note: "Fridge once opened. Vermouth keeps about a month; buy fizz when you need it.", items: [
      { id: "sweet-vermouth", name: "Sweet vermouth", label: "sweet vermouth", uses: "Negroni, Manhattan, Boulevardier, Rob Roy, Bobby Burns, Americano, Sbagliato, Rosita, Martinez, Bijou" },
      { id: "dry-vermouth", name: "Dry vermouth", label: "dry vermouth", uses: "Martini, Rosita" },
      { id: "prosecco", name: "Prosecco", label: "prosecco", uses: "Aperol Spritz, Negroni Sbagliato" },
      { id: "champagne", name: "Champagne or crémant", label: "champagne", uses: "French 75" },
    ]},
    { title: "Bitters & Syrups", note: "Make the sugar and honey-ginger syrups at home; both keep two to three weeks in the fridge.", items: [
      { id: "angostura", name: "Angostura bitters", label: "bitters", uses: "Old Fashioned, Manhattan, Whisky Sour, Rob Roy, Monte Carlo, Rosita, Martinez, Bijou" },
      { id: "sugar-syrup", name: "Sugar syrup", label: "sugar syrup", uses: "Old Fashioned, Whisky Sour, Gimlet, Tom Collins, French 75", homemade: true },
      { id: "honey-ginger-syrup", name: "Honey-ginger syrup", label: "honey-ginger syrup", uses: "Penicillin", homemade: true },
    ]},
    { title: "Mixers", note: "Small cans or bottles go flat less quickly than big ones.", items: [
      { id: "soda", name: "Soda water", label: "soda water", uses: "Tom Collins, Aperol Spritz, Americano" },
      { id: "grapefruit-soda", name: "Grapefruit soda", label: "grapefruit soda", uses: "Paloma" },
      { id: "cranberry", name: "Cranberry juice", label: "cranberry juice", uses: "Cosmopolitan" },
      { id: "tomato", name: "Tomato juice", label: "tomato juice", uses: "Bloody Mary" },
    ]},
    { title: "Fresh", note: "Buy close to when you need them. Squeeze citrus on the day.", items: [
      { id: "limes", name: "Limes", label: "limes", uses: "Margarita, Gimlet, Cosmopolitan, Paloma, Last Word" },
      { id: "lemons", name: "Lemons", label: "lemons", uses: "Whisky Sour, Tom Collins, French 75, Bloody Mary, Penicillin, Paper Plane, Gold Rush, Bee's Knees, White Lady, Frisco Sour" },
      { id: "oranges", name: "Oranges", label: "oranges", uses: "Peel for Negroni, Old Fashioned, Boulevardier, Americano; slices for Spritz" },
      { id: "ginger", name: "Fresh ginger", label: "fresh ginger", uses: "Honey-ginger syrup" },
      { id: "eggs", name: "Eggs", label: "eggs", uses: "Whisky Sour (egg white, optional)" },
      { id: "cream", name: "Double cream", label: "cream", uses: "White Russian, Alexander, Chocolate Martini" },
      { id: "coffee", name: "Coffee for espresso", label: "coffee", uses: "Espresso Martini" },
      { id: "celery", name: "Celery", label: "celery", uses: "Bloody Mary garnish" },
    ]},
    { title: "Pantry & Garnishes", note: "Cupboard staples, plus a couple of jars for the fridge.", items: [
      { id: "caster-sugar", name: "Caster sugar", label: "sugar", uses: "Sugar syrup" },
      { id: "honey", name: "Honey", label: "honey", uses: "Honey-ginger syrup, Gold Rush, Bee's Knees, Scotch Old Fashioned" },
      { id: "salt", name: "Flaky sea salt", label: "salt", uses: "Margarita rim, Paloma" },
      { id: "worcestershire", name: "Worcestershire sauce", label: "Worcestershire sauce", uses: "Bloody Mary" },
      { id: "tabasco", name: "Tabasco", label: "Tabasco", uses: "Bloody Mary" },
      { id: "celery-salt", name: "Celery salt", label: "celery salt", uses: "Bloody Mary" },
      { id: "pepper", name: "Black pepper", label: "black pepper", uses: "Bloody Mary" },
      { id: "olives", name: "Green olives", label: "olives", uses: "Martini" },
      { id: "cherries", name: "Cocktail cherries", label: "cherries", uses: "Manhattan, Rob Roy, Whisky Sour" },
      { id: "nutmeg", name: "Whole nutmeg", label: "nutmeg", uses: "Alexander" },
    ]},
    { title: "Freezer", note: "More than you think. Buy a bag if you're making several rounds.", items: [
      { id: "ice", name: "Ice cubes", label: "ice", uses: "Almost everything" },
    ]},
  ];

  const SUGAR = { any: ["sugar-syrup", "caster-sugar"], label: "sugar" };
  const HONEY_GINGER = { any: ["honey-ginger-syrup", ["honey", "ginger"]], label: "honey-ginger syrup" };

  /* group: "classic" or "more". tags drive the menu's filters. */
  const DRINKS = [
    // ---- classics ----
    { id: "negroni", name: "Negroni", group: "classic", tags: ["gin", "stirred"],
      blurb: "Bitter, boozy and orange-scented. Served short over ice.",
      spec: "Gin, Campari, sweet vermouth, orange", needs: ["gin", "campari", "sweet-vermouth"] },
    { id: "old-fashioned", name: "Old Fashioned", group: "classic", tags: ["whisky", "stirred"],
      blurb: "Whisky softened with a little sugar and bitters. Strong and slow-sipping.",
      spec: "Bourbon or Scotch, sugar, Angostura, orange", needs: [{ any: ["bourbon", "scotch"], label: "whisky" }, "angostura", SUGAR] },
    { id: "manhattan", name: "Manhattan", group: "classic", tags: ["whisky", "stirred"],
      blurb: "Rich and smooth, served straight up with a cherry.",
      spec: "Bourbon, sweet vermouth, Angostura, cherry", needs: ["bourbon", "sweet-vermouth", "angostura"] },
    { id: "martini", name: "Martini", group: "classic", tags: ["gin", "vodka", "stirred"],
      blurb: "Very cold and very dry. Your choice of gin or vodka, olive or twist.",
      spec: "Gin or vodka, dry vermouth, olive or a twist", needs: [{ any: ["gin", "vodka"], label: "gin or vodka" }, "dry-vermouth"] },
    { id: "margarita", name: "Margarita", group: "classic", tags: ["tequila", "shaken"],
      blurb: "Sharp, bright and salty-sweet.",
      spec: "Tequila, Cointreau, fresh lime, salted rim", needs: ["tequila", "cointreau", "limes"] },
    { id: "whisky-sour", name: "Whisky Sour", group: "classic", tags: ["whisky", "shaken"],
      blurb: "Sweet, sour and silky, with a frothy top if you'd like egg white.",
      spec: "Bourbon, lemon, sugar, egg white", needs: ["bourbon", "lemons", SUGAR] },
    { id: "gimlet", name: "Gimlet", group: "classic", tags: ["gin", "shaken"],
      blurb: "Crisp and tart. Gin and lime at their simplest.",
      spec: "Gin, fresh lime, sugar", needs: ["gin", "limes", SUGAR] },
    { id: "last-word", name: "Last Word", group: "classic", tags: ["gin", "shaken"],
      blurb: "Herbal, sweet-sour and punchy. A 1920s favourite.",
      spec: "Gin, green Chartreuse, maraschino, lime", needs: ["gin", "chartreuse", "maraschino", "limes"] },
    { id: "cosmopolitan", name: "Cosmopolitan", group: "classic", tags: ["vodka", "shaken"],
      blurb: "Pink, tart and fruity.",
      spec: "Vodka, Cointreau, lime, cranberry", needs: ["vodka", "cointreau", "limes", "cranberry"] },
    { id: "paloma", name: "Paloma", group: "classic", tags: ["tequila", "long"],
      blurb: "Long, fizzy and refreshing, with a pinch of salt.",
      spec: "Tequila, grapefruit soda, lime", needs: ["tequila", "grapefruit-soda", "limes"] },
    { id: "tom-collins", name: "Tom Collins", group: "classic", tags: ["gin", "long"],
      blurb: "Gin with fresh lemon and soda. Grown-up lemonade.",
      spec: "Gin, lemon, sugar, soda", needs: ["gin", "lemons", SUGAR, "soda"] },
    { id: "french-75", name: "French 75", group: "classic", tags: ["gin", "long"],
      blurb: "Gin and lemon topped with champagne. For celebrating.",
      spec: "Gin, lemon, sugar, champagne", needs: ["gin", "lemons", SUGAR, "champagne"] },
    { id: "aperol-spritz", name: "Aperol Spritz", group: "classic", tags: ["long"],
      blurb: "Light, bittersweet and orangey. Low in alcohol.",
      spec: "Aperol, prosecco, soda, orange slice", needs: ["aperol", "prosecco", "soda"] },
    { id: "bloody-mary", name: "Bloody Mary", group: "classic", tags: ["vodka", "long"],
      blurb: "Savoury and spicy. Brunch in a glass.",
      spec: "Vodka, tomato, lemon, Worcestershire, Tabasco", needs: ["vodka", "tomato", "lemons", "worcestershire"] },
    { id: "espresso-martini", name: "Espresso Martini", group: "classic", tags: ["vodka", "after"],
      blurb: "Fresh coffee, shaken cold. Sweet, bitter and wide awake.",
      spec: "Vodka, coffee liqueur, fresh espresso", needs: ["vodka", "coffee-liqueur", "coffee"] },
    { id: "white-russian", name: "White Russian", group: "classic", tags: ["vodka", "after"],
      blurb: "Creamy iced coffee with a kick.",
      spec: "Vodka, coffee liqueur, cream", needs: ["vodka", "coffee-liqueur", "cream"] },

    // ---- something different ----
    { id: "boulevardier", name: "Boulevardier", group: "more", tags: ["whisky", "stirred"],
      blurb: "A Negroni made with bourbon. Richer and warmer.",
      spec: "Bourbon, Campari, sweet vermouth", needs: ["bourbon", "campari", "sweet-vermouth"] },
    { id: "rob-roy", name: "Rob Roy", group: "more", tags: ["whisky", "stirred"],
      blurb: "A Manhattan made with Scotch.",
      spec: "Scotch, sweet vermouth, Angostura, cherry", needs: ["scotch", "sweet-vermouth", "angostura"] },
    { id: "bobby-burns", name: "Bobby Burns", group: "more", tags: ["whisky", "stirred"],
      blurb: "Scotch and vermouth with a touch of herbal honey.",
      spec: "Scotch, sweet vermouth, Bénédictine", needs: ["scotch", "sweet-vermouth", "benedictine"] },
    { id: "martinez", name: "Martinez", group: "more", tags: ["gin", "stirred"],
      blurb: "The Martini's sweeter, rounder ancestor.",
      spec: "Gin, sweet vermouth, maraschino, bitters", needs: ["gin", "sweet-vermouth", "maraschino", "angostura"] },
    { id: "bijou", name: "Bijou", group: "more", tags: ["gin", "stirred"],
      blurb: "Gin, vermouth and Chartreuse. Herbal and jewel-coloured.",
      spec: "Gin, sweet vermouth, green Chartreuse, bitters", needs: ["gin", "sweet-vermouth", "chartreuse"] },
    { id: "rosita", name: "Rosita", group: "more", tags: ["tequila", "stirred"],
      blurb: "A Negroni made with tequila.",
      spec: "Tequila, Campari, sweet and dry vermouth, bitters", needs: ["tequila", "campari", "sweet-vermouth", "dry-vermouth"] },
    { id: "monte-carlo", name: "Monte Carlo", group: "more", tags: ["whisky", "stirred"],
      blurb: "Like an Old Fashioned sweetened with herbal liqueur.",
      spec: "Bourbon, Bénédictine, Angostura", needs: ["bourbon", "benedictine", "angostura"] },
    { id: "americano", name: "Americano", group: "more", tags: ["long"],
      blurb: "Bitter and refreshing, and low in alcohol.",
      spec: "Campari, sweet vermouth, soda, orange", needs: ["campari", "sweet-vermouth", "soda"] },
    { id: "negroni-sbagliato", name: "Negroni Sbagliato", group: "more", tags: ["long"],
      blurb: "A Negroni with prosecco in place of the gin. Lighter and fizzy.",
      spec: "Campari, sweet vermouth, prosecco", needs: ["campari", "sweet-vermouth", "prosecco"] },
    { id: "paper-plane", name: "Paper Plane", group: "more", tags: ["whisky", "shaken"],
      blurb: "Bittersweet and bright. Four ingredients in equal parts.",
      spec: "Bourbon, Aperol, Amaro Nonino, lemon", needs: ["bourbon", "aperol", "nonino", "lemons"] },
    { id: "penicillin", name: "Penicillin", group: "more", tags: ["whisky", "shaken"],
      blurb: "Honey, lemon and ginger with a wisp of peat smoke.",
      spec: "Scotch, lemon, honey-ginger, smoky Islay float", needs: ["scotch", "islay", "lemons", HONEY_GINGER] },
    { id: "gold-rush", name: "Gold Rush", group: "more", tags: ["whisky", "shaken"],
      blurb: "Bourbon, lemon and honey. Simple and golden.",
      spec: "Bourbon, lemon, honey", needs: ["bourbon", "lemons", "honey"] },
    { id: "bees-knees", name: "Bee's Knees", group: "more", tags: ["gin", "shaken"],
      blurb: "Gin, lemon and honey. Bright and floral.",
      spec: "Gin, lemon, honey", needs: ["gin", "lemons", "honey"] },
    { id: "white-lady", name: "White Lady", group: "more", tags: ["gin", "shaken"],
      blurb: "Clean, citrusy and elegant.",
      spec: "Gin, Cointreau, lemon", needs: ["gin", "cointreau", "lemons"] },
    { id: "frisco-sour", name: "Frisco Sour", group: "more", tags: ["whisky", "shaken"],
      blurb: "A whisky sour with a herbal edge.",
      spec: "Bourbon, Bénédictine, lemon", needs: ["bourbon", "benedictine", "lemons"] },
    { id: "black-russian", name: "Black Russian", group: "more", tags: ["vodka", "after"],
      blurb: "Coffee liqueur and vodka over ice. Short and sweet.",
      spec: "Vodka, coffee liqueur", needs: ["vodka", "coffee-liqueur"] },
    { id: "alexander", name: "Alexander", group: "more", tags: ["gin", "after"],
      blurb: "Creamy and chocolatey, dusted with nutmeg.",
      spec: "Gin, crème de cacao, cream, nutmeg", needs: ["gin", "cacao", "cream"] },
    { id: "chocolate-martini", name: "Chocolate Martini", group: "more", tags: ["vodka", "after"],
      blurb: "Dessert in a glass.",
      spec: "Vodka, crème de cacao, a splash of cream", needs: ["vodka", "cacao", "cream"] },
  ];

  const byId = {};
  STOCK.forEach(s => s.items.forEach(it => { byId[it.id] = it; }));

  /* What's stopping a drink being made, as guest-readable labels. [] = can make. */
  function missing(drink, have) {
    const ok = (alt) => Array.isArray(alt) ? alt.every(id => have.has(id)) : have.has(alt);
    const out = [];
    for (const need of drink.needs) {
      if (typeof need === "string") { if (!have.has(need)) out.push(byId[need] ? byId[need].label : need); }
      else if (!need.any.some(ok)) out.push(need.label);
    }
    return out;
  }

  /* "gin", "gin and lemons", "gin, lemons and soda water" */
  function listLabels(xs) {
    if (xs.length < 2) return xs.join("");
    return xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
  }

  window.BAR = { STOCK, DRINKS, byId, missing, listLabels };
})();
