/* Shopping list categories — which part of the shop an item lives in.
 *
 * One file, used in two places: the shopping list page imports it so an item
 * lands in its group the moment it's typed (no signal needed), and the Worker
 * (src/shopping.js) imports it for items added by Siri or from a recipe.
 *
 * How an item is placed, first match wins:
 *   1. a choice you've made before — move "Halloumi" to Chilled once and it
 *      goes there every time (stored in D1, passed in as `learned`)
 *   2. a word that overrides everything else ("frozen", "tinned")
 *   3. the word list below — the longest phrase that matches wins, and between
 *      equal lengths the one later in the name, because in English the last
 *      word is usually the thing itself ("orange JUICE", "chicken STOCK")
 *   4. failing all that, the Worker asks Workers AI and remembers the answer
 *
 * To add a word: put it, singular and lower case, in the right list. A
 * phrase that should beat its last word ("peanut butter" is not dairy) goes
 * in the same way — longer always wins.
 */

/* In the order you'd walk round a typical UK supermarket. The page shows
 * groups in this order. Ids are stored with each item — don't rename one. */
export const CATEGORIES = [
  { id: "fruit-veg", label: "Fruit & veg" },
  { id: "bakery", label: "Bakery" },
  { id: "meat-fish", label: "Meat & fish" },
  { id: "dairy", label: "Dairy & eggs" },
  { id: "chilled", label: "Chilled & deli" },
  { id: "cupboard", label: "Cupboard" },
  { id: "snacks", label: "Snacks & treats" },
  { id: "drinks", label: "Drinks" },
  { id: "alcohol", label: "Beer, wine & spirits" },
  { id: "frozen", label: "Frozen" },
  { id: "household", label: "Household" },
  { id: "toiletries", label: "Toiletries & health" },
  { id: "other", label: "Other" },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

const WORDS = {
  "fruit-veg": `
    apple, apricot, avocado, banana, berry, blackberry, blueberry, cherry, clementine, cranberry, date,
    fig, grape, grapefruit, kiwi, lemon, lime, mango, melon, nectarine, orange, papaya, passion fruit,
    peach, pear, pineapple, plum, pomegranate, raspberry, rhubarb, satsuma, strawberry, tangerine, watermelon,
    fruit, veg, vegetable, salad, salad leaf, salad bag,
    artichoke, asparagus, aubergine, beansprout, bean sprout, beetroot, broccoli, tenderstem, brussels sprout,
    butternut, butternut squash, squash, cabbage, hispi, cavolo nero, kale, carrot, cauliflower, celeriac,
    celery, chard, chicory, chilli, chillies, chile, jalapeno, corn on the cob, corn cob, sweetcorn cob,
    courgette, cucumber, endive, fennel, garlic, ginger, fresh ginger, galangal, lemongrass, green bean,
    runner bean, broad bean, french bean, edamame, leek, lettuce, little gem, romaine, iceberg, rocket,
    watercress, spinach, baby spinach, mangetout, sugar snap, sugar snap pea, mushroom, okra, onion,
    red onion, spring onion, shallot, parsnip, pak choi, bok choy, pepper, red pepper, green pepper,
    yellow pepper, romano pepper, potato, new potato, sweet potato, baking potato, pumpkin, radish,
    swede, turnip, tomato, cherry tomato, vine tomato, yam, cress, herb, fresh herb,
    basil, bay leaf, chive, coriander, dill, mint, parsley, flat leaf parsley, rosemary,
    sage, tarragon, thyme, lemon thyme, microherb, beet, physalis, kohlrabi, samphire, wild garlic, baby corn, plum tomato, garlic clove, oregano
  `,
  bakery: `
    bread, loaf, sourdough, baguette, ciabatta, focaccia, bun, burger bun, brioche, brioche bun, roll,
    bread roll, bagel, croissant, pain au chocolat, crumpet, muffin, english muffin, pitta, pita, naan,
    flatbread, wrap, tortilla, tortilla wrap, flour tortilla, corn tortilla, chapati, teacake, scone,
    crusty bread, white bread, wholemeal bread, rye bread, cake, doughnut, donut, pastry, danish,
    hot cross bun, mince pie, sandwich thin, panettone, crumpets
  `,
  "meat-fish": `
    meat, beef, steak, sirloin, ribeye, rib eye, fillet steak, rump, brisket, short rib, beef short rib,
    mince, beef mince, pork mince, lamb mince, turkey mince, pork, pork belly, pork chop, pork loin,
    pork shoulder, tomahawk, gammon, ham joint, lamb, lamb chop, lamb shank, leg of lamb, chicken,
    chicken breast, chicken thigh, chicken wing, chicken drumstick, whole chicken, turkey, duck, duck breast,
    venison, rabbit, pheasant, sausage, chipolata, bacon, lardon, pancetta, joint, rib, ribs, oxtail, liver,
    kidney, black pudding, fish, salmon, salmon fillet, smoked salmon, cod, haddock, smoked haddock, hake,
    pollock, sea bass, seabass, sea bream, mackerel, trout, tuna steak, monkfish, plaice,
    sole, halibut, prawn, king prawn, tiger prawn, shrimp, scallop, mussel, clam, squid, calamari, crab,
    lobster, langoustine, octopus, kipper, fishcake, fish cake, white fish
  `,
  dairy: `
    milk, semi skimmed, semi skimmed milk, skimmed milk, whole milk, oat milk, almond milk, soya milk,
    soy milk, buttermilk, butter, unsalted butter, salted butter, spreadable butter, margarine,
    cream, double cream, single cream, whipping cream, clotted cream, soured cream, sour cream,
    creme fraiche, cheese, cheddar, mature cheddar, parmesan, parmigiano, pecorino, grana padano,
    mozzarella, burrata, feta, halloumi, gruyere, emmental, gouda, edam, brie, camembert, stilton,
    blue cheese, goat cheese, goats cheese, red leicester, double gloucester, wensleydale, manchego,
    ricotta, mascarpone, cream cheese, cottage cheese, paneer, comte, taleggio, raclette, cheese slice,
    yoghurt, yogurt, greek yoghurt, greek yogurt, natural yoghurt, labneh, kefir, skyr, fromage frais,
    egg, free range egg, egg white, egg yolk, quail egg, custard
  `,
  chilled: `
    hummus, houmous, tzatziki, guacamole, salsa dip, dip, coleslaw, pate, fresh pesto,
    fresh pasta, gnocchi, tofu, tempeh, quorn, chorizo, salami, prosciutto, parma ham, serrano ham,
    ham, sliced ham, cooked ham, cooked chicken, pepperoni, deli, olive, green olive, black olive,
    sun dried tomato, sundried tomato, antipasti, ready meal, fresh soup, quiche, pork pie,
    sausage roll, scotch egg, sandwich, fresh custard, cooking chorizo, falafel, pastry block,
    puff pastry, shortcrust pastry, filo, filo pastry, ready rolled pastry, cornichon
  `,
  cupboard: `
    pasta, spaghetti, penne, fusilli, rigatoni, tagliatelle, linguine, macaroni, lasagne, lasagne sheet,
    orzo, noodle, egg noodle, rice noodle, ramen, udon, rice, basmati, jasmine rice, arborio, risotto rice,
    long grain rice, wild rice, couscous, bulgur, quinoa, polenta, cornmeal, masarepa, oat, porridge,
    porridge oat, cereal, granola, muesli, cornflake, weetabix, flour, plain flour, self raising flour,
    strong flour, bread flour, 00 flour, cornflour, corn flour, wholemeal flour, baking powder,
    bicarbonate of soda, bicarb, yeast, dried yeast, sugar, caster sugar, granulated sugar, icing sugar,
    brown sugar, muscovado, demerara, golden syrup, maple syrup, syrup, sugar syrup, simple syrup,
    treacle, honey, jam, marmalade, lemon curd, peanut butter, almond butter, nutella, chocolate spread,
    vanilla, vanilla extract, vanilla pod, cocoa, cocoa powder, baking chocolate, chocolate chip,
    sprinkle, food colouring, gelatine, ground almond, desiccated coconut, oil, olive oil,
    extra virgin olive oil, vegetable oil, sunflower oil, rapeseed oil, groundnut oil, sesame oil,
    coconut oil, cooking spray, vinegar, balsamic, balsamic vinegar, cider vinegar, red wine vinegar,
    white wine vinegar, rice vinegar, salt, sea salt, flaky salt, flaky sea salt, celery salt,
    pepper ground, black pepper, peppercorn, white pepper, spice, cumin, ground cumin, coriander seed,
    ground coriander, paprika, smoked paprika, cayenne, cayenne pepper, chilli flake, chilli powder,
    turmeric, ground turmeric, cinnamon, nutmeg, whole nutmeg, ground nutmeg, ground ginger, clove,
    cardamom, star anise, allspice, garam masala, curry powder, five spice, fennel seed, mustard seed,
    sesame seed, dried oregano, dried thyme, dried basil, mixed herb, herbes de provence, bouquet garni,
    garlic granule, garlic powder, onion powder, stock, stock cube, stock pot, beef stock, chicken stock,
    vegetable stock, gravy, gravy granule, bisto, oxo, sauce, soy sauce, dark soy, light soy,
    fish sauce, oyster sauce, hoisin, hoisin sauce, sweet chilli sauce, sriracha, hot sauce, tabasco,
    worcestershire sauce, ketchup, tomato ketchup, mayonnaise, mayo, kewpie, mustard, dijon,
    wholegrain mustard, english mustard, brown sauce, bbq sauce, barbecue sauce, salad cream, relish,
    chutney, pickle, harissa, harissa paste, miso, gochujang, tahini, curry paste, tomato puree,
    tomato paste, passata, chopped tomato, tinned tomato, plum tomato, crushed tomato, sun dried tomatoes,
    pasta sauce, pesto, caper, anchovy, sardine, tuna, tinned tuna, tin, can, bean, baked bean,
    kidney bean, black bean, butter bean, cannellini, cannellini bean, borlotti, pinto bean, chickpea,
    lentil, red lentil, puy lentil, split pea, coconut milk, coconut cream, sweetcorn, chipotle,
    chipotle in adobo, adobo, ancho, dried chilli, chile de arbol, water chestnut,
    bamboo shoot, breadcrumb, panko, crouton, nut, almond, walnut, cashew, pecan, pistachio, hazelnut,
    pine nut, peanut, seed, pumpkin seed, sunflower seed, chia, linseed, flaxseed, raisin, sultana,
    currant, dried apricot, dried fruit, prune, cocktail cherry, maraschino cherry,
    glace cherry, stuffing, shaoxing, rice wine, mirin, jelly, custard powder,
    stock powder, msg, crispy onion, crispy shallot, fried shallot, nori, seaweed, cornichon, gherkin,
    evaporated milk, condensed milk, long life milk, uht milk, powdered milk, lemon juice,
    lime juice, bottled lemon juice, cream of tartar, xanthan, agar, taco shell, paste, pickle juice, redcurrant jelly
  `,
  snacks: `
    crisp, crisps, popcorn, pretzel, tortilla chip, nacho, biscuit, cookie, digestive, hobnob, shortbread,
    cracker, cream cracker, oatcake, rice cake, crispbread, breadstick, chocolate, chocolate bar,
    dark chocolate, milk chocolate, sweet, sweets, haribo, mint sweet, chewing gum, gum, cereal bar,
    flapjack, protein bar, snack, trail mix, dried mango, jaffa cake, wafer, marshmallow, fudge
  `,
  drinks: `
    water, sparkling water, still water, soda water, tonic, tonic water, slimline tonic, mixer,
    lemonade, cola, coke, diet coke, pepsi, ginger ale, ginger beer, cordial,
    elderflower cordial, juice, orange juice, apple juice, cranberry juice, tomato juice,
    grapefruit juice, pineapple juice, smoothie, grapefruit soda, soda, energy drink, iced tea,
    tea, tea bag, teabag, green tea, herbal tea, coffee, ground coffee, coffee bean, instant coffee,
    espresso, coffee pod, coffee for espresso, hot chocolate, drinking chocolate, horlicks, ovaltine,
    kombucha, fizzy water, orange squash, blackcurrant squash, summer fruits squash, fruit squash, ribena,
    no added sugar squash
  `,
  alcohol: `
    beer, lager, ale, pale ale, ipa, stout, porter, cider, wine, red wine, white wine, rose wine, rose,
    prosecco, champagne, cava, cremant, sparkling wine, port, sherry, madeira, vermouth, sweet vermouth,
    dry vermouth, gin, london dry gin, vodka, rum, white rum, dark rum, spiced rum, tequila, blanco tequila,
    mezcal, whisky, whiskey, scotch, scotch whisky, bourbon, rye whiskey, single malt, brandy, cognac,
    armagnac, calvados, liqueur, coffee liqueur, maraschino liqueur, cointreau, triple sec, grand marnier,
    campari, aperol, amaro, chartreuse, benedictine, creme de cacao, creme de cassis, amaretto, baileys,
    kahlua, limoncello, sambuca, absinthe, pastis, pimms, bitters, angostura, angostura bitters,
    peychaud, orange bitters, pinot grigio, sauvignon blanc, chardonnay, merlot, rioja, malbec, shiraz,
    pinot noir, cooking wine, marsala
  `,
  frozen: `
    frozen, ice, ice cube, ice cream, ice lolly, sorbet, gelato, frozen pea, pea, petit pois,
    fish finger, chip, oven chip, potato waffle, hash brown, frozen berries, frozen fruit, frozen veg,
    frozen spinach, frozen pizza, pizza, yorkshire pudding, garlic bread
  `,
  household: `
    kitchen roll, kitchen towel, toilet roll, loo roll, toilet paper, tissue, tissues, napkin, foil,
    tin foil, kitchen foil, cling film, clingfilm, baking paper, greaseproof paper, parchment, baking parchment,
    sandwich bag, freezer bag, food bag, bin bag, bin liner, washing up liquid, dishwasher tablet,
    dishwasher salt, rinse aid, washing powder, laundry, laundry liquid, laundry detergent, detergent,
    fabric conditioner, fabric softener, bleach, cleaner, surface spray, anti bacterial spray,
    disinfectant, sponge, scourer, cloth, dishcloth, j cloth, glove, rubber glove, duster, polish,
    air freshener, candle, match, lighter, battery, light bulb, bulb, cat food, dog food, cat litter,
    pet food, dog treat, dog poo bag, poo bag, firelighter, charcoal, kindling, descaler, limescale remover,
    oven cleaner, drain unblocker, plastic wrap, zip lock bag, cocktail stick, skewer, straw, paper plate,
    paper cup, birthday candle, ice cube bag, bin, recycling bag, tea towel, oven glove
  `,
  toiletries: `
    toothpaste, toothbrush, floss, mouthwash, shampoo, conditioner, shower gel, body wash, soap, hand wash,
    handwash, deodorant, antiperspirant, razor, razor blade, shaving foam, shaving gel, moisturiser,
    moisturizer, hand cream, lip balm, sun cream, suncream, sunscreen, after sun, cotton wool, cotton bud,
    plaster, paracetamol, ibuprofen, aspirin, antihistamine, vitamin, vitamins, multivitamin, cold remedy,
    lemsip, throat lozenge, rennie, gaviscon, nappy, nappies, baby wipe, wipe, wet wipe, sanitary,
    tampon, sanitary towel, contact lens solution, hair gel, hairspray, makeup remover, face wash, hand gel,
    hand sanitiser, nail varnish remover, plasters, medicine, calpol, eye drop
  `,
};

/* Words that settle it on their own, wherever they appear in the name. */
const OVERRIDES = [
  [/\bfrozen\b/, "frozen"],
  [/\b(tinned|canned|tin of|can of|jar of)\b/, "cupboard"],
  [/\bdried\b(?! (yeast|fruit))/, "cupboard"],
  [/\bpickled\b/, "cupboard"],
];

/* ---- matching ---- */

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // gruyère → gruyere
    .replace(/\(.*?\)/g, " ")                           // "(optional)"
    .replace(/,.*$/, "")                                // "carrot, grated" → carrot
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* singular, so the word list only needs one form */
const IRREGULAR = { leaves: "leaf", loaves: "loaf", halves: "half", knives: "knife", pies: "pie" };
function single(w) {
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3 || /(ss|us|is|ous)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(oes|ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

const LOOKUP = new Map();
let longest = 1;
for (const [cat, list] of Object.entries(WORDS)) {
  for (const raw of list.split(",")) {
    const phrase = fold(raw).split(" ").map(single).join(" ");
    if (!phrase) continue;
    if (!LOOKUP.has(phrase)) LOOKUP.set(phrase, cat);
    longest = Math.max(longest, phrase.split(" ").length);
  }
}

/* The key a learned choice is stored under: "2 x Tins of chopped tomatoes"
 * and "chopped tomato" share one. */
export function itemKey(name) {
  return fold(name).replace(/^\d+(\.\d+)?\s*(x|kg|g|ml|l|pack|packs|tin|tins|can|cans)?\s+/, "")
    .split(" ").map(single).join(" ").trim();
}

/* → a category id, or null when the word list doesn't know the item. */
export function categorise(name, learned) {
  const key = itemKey(name);
  if (!key) return null;
  if (learned && learned[key]) return learned[key];
  for (const [re, cat] of OVERRIDES) if (re.test(key)) return cat;
  const words = key.split(" ");
  let best = null;
  for (let len = Math.min(longest, words.length); len >= 1 && !best; len--) {
    for (let start = words.length - len; start >= 0; start--) {   // later in the name wins a tie
      const cat = LOOKUP.get(words.slice(start, start + len).join(" "));
      if (cat) { best = cat; break; }
    }
  }
  return best;
}

export function categoryLabel(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.label : "Other";
}
