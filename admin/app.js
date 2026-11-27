(async function () {
  "use strict";

  const CURRENT_USER = "demo-admin@cascade.local";
  const STORAGE_KEY = "cascade-products-admin-phase-1";
  const LOCAL_SEED_VERSION = "2026-10-26-order-pad-suggestion-groups";
  const OPTIMISATION_CONFIG = Object.freeze({
    packOptimisationEnabled: true,
    maximumExcessPercentage: 10,
  });
  const CATEGORY_LABELS = {
    A: "Appliances",
    B: "Branded",
    C: "Catheters",
    D: "Controlled drug",
    E: "Food",
    F: "Fridge",
    G: "Generic",
    H: "Homeopathic",
    I: "Insulin product",
    J: "Borderline substances ACBS",
    K: "Stockings",
    L: "Bed pans, urinals, gloves, covers",
    M: "MGD (Virtual)",
    N: "NRT",
    O: "Female contraceptives",
    P: "Parallel import",
    Q: "Specials",
    R: "Dressings",
    S: "Surgical, bags, stoma, ostomy",
    T: "Tariff appliances",
    U: "Urine bags",
    V: "(Virtual)",
    W: "Cat M drugs",
    X: "Category unknown",
    Y: "Hypodermic",
    Z: "Zero discount",
    GQ: "Special",
    QG: "Special",
  };
  const MAPPING_CONFIG = {
    brand: {
      heading: "Brand-Generic Equalisation",
      description: "Link approved branded and generic products that can be compared during ordering.",
      action: "Add Brand Equivalent",
    },
    pi: {
      heading: "PI Equivalent",
      description: "Link approved parallel-import alternatives used for PI optimisation.",
      action: "Add PI Equivalent",
    },
    pack: {
      heading: "Pack Equivalent",
      description: "Approve different pack sizes once as a shared, bidirectional product relationship.",
      action: "Add Pack Equivalent",
    },
  };
  const BRAND_ACTIVE_INGREDIENTS = {
    panadol: "Paracetamol",
    calpol: "Paracetamol",
    nurofen: "Ibuprofen",
    prozac: "Fluoxetine",
    plavix: "Clopidogrel",
    lipitor: "Atorvastatin",
    valtrex: "Valaciclovir",
    dulcolax: "Bisacodyl",
  };
  const STRENGTH_UNITS = ["mg", "g", "microgram", "%", "unit", "IU", "mmol"];
  const PER_UNITS = ["ml", "g", "dose", "spray", "actuation", "hour", "24 hours", "tablet", "capsule", "unit"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function dateTimeLabel(value = new Date()) {
    const textValue = typeof value === "string" ? value.trim() : "";
    const existing = textValue.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s+(\d{1,2}):(\d{2})$/);
    if (existing) return `${existing[1].padStart(2, "0")} ${existing[2]} ${existing[3]}, ${existing[4].padStart(2, "0")}:${existing[5]}`;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return textValue || "-";
    const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
    return `${String(date.getDate()).padStart(2, "0")} ${month} ${date.getFullYear()}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function nowLabel() {
    return dateTimeLabel(new Date());
  }

  function normaliseText(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function slug(value) {
    return normaliseText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function statusClass(value) {
    return `status-${slug(value)}`;
  }

  function categoryCodes(value) {
    return [...new Set(String(value || "").toUpperCase().split(/[,;]+/).map((code) => code.trim()).filter(Boolean))];
  }

  function categoryLabel(code) {
    const codes = categoryCodes(code);
    if (codes.includes("P")) return "Parallel Import";
    if (codes.includes("G") || codes.includes("GQ") || codes.includes("QG")) return "Generic";
    if (codes.includes("B")) return "Brand";
    return CATEGORY_LABELS[codes[0]] || "Other";
  }

  function categoryCodeLabel(code) {
    return CATEGORY_LABELS[code] || `Category ${code}`;
  }

  function categoryDisplay(value) {
    const codes = categoryCodes(value);
    if (!codes.length) return "";
    return `${codes.join(",")} - ${codes.map(categoryCodeLabel).join(", ")}`;
  }

  function inferActiveIngredient(name) {
    const productName = String(name || "");
    const normalisedName = ` ${normaliseText(productName).replace(/[^a-z0-9]+/g, " ")} `;
    const brandedIngredient = Object.entries(BRAND_ACTIVE_INGREDIENTS)
      .find(([brand]) => normalisedName.includes(` ${brand} `))?.[1];
    if (brandedIngredient) return brandedIngredient;
    return productName
      .replace(/\*PI\*/gi, "")
      .replace(/\s*\([^)]*\)\s*$/g, "")
      .split(/\s+(?=\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:micrograms?|mcg|mg|%|i\.?u\.?|units?)\b)/i, 1)[0]
      .trim();
  }

  function normaliseStrengthUnit(value) {
    const unit = normaliseText(value).replaceAll(".", "");
    if (unit === "mcg" || unit.startsWith("microgram")) return "microgram";
    if (unit === "iu") return "IU";
    if (unit.startsWith("unit")) return "unit";
    return STRENGTH_UNITS.find((item) => normaliseText(item) === unit) || value || "mg";
  }

  function normaliseSolidPackUnit(dosageForm, packUnit) {
    const solidPackUnits = { Tablet: "Tablets", Caplet: "Caplets", Capsule: "Capsules" };
    const requestedPackUnit = String(packUnit || "");
    return solidPackUnits[dosageForm] && ["Tablets", "Caplets", "Capsules"].includes(requestedPackUnit)
      ? solidPackUnits[dosageForm]
      : requestedPackUnit;
  }

  function ingredientRecord(name, strengthValue = "", strengthUnit = "mg", perValue = "", perUnit = "") {
    return {
      name: String(name || "").trim(),
      strengthValue: String(strengthValue || "").trim(),
      strengthUnit: normaliseStrengthUnit(strengthUnit),
      perValue: String(perValue || "").trim(),
      perUnit: String(perUnit || "").trim(),
    };
  }

  function stableIdentityHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function inferredProductFamilyId(product) {
    const ingredients = (product.ingredients || [])
      .map((item) => normaliseText(`${item.name}|${item.strengthValue}|${normaliseStrengthUnit(item.strengthUnit)}|${item.perValue}|${item.perUnit}`))
      .sort()
      .join(";");
    const comparableUnit = normaliseText(product.secondaryUnit || product.packUnit).replace(/s$/, "");
    const identity = [
      ingredients,
      product.dosageForm,
      product.route,
      product.releaseType,
      product.formulationModifier || "None",
      comparableUnit,
    ].map(normaliseText).join("|");
    return ingredients && comparableUnit ? `PF-AUTO-${stableIdentityHash(identity)}` : "";
  }

  function packQuantityNumber(product) {
    const value = Number(product.secondaryQuantity || product.packQuantity);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function compactQuantity(value) {
    return Number(value).toLocaleString("en-GB", { maximumFractionDigits: 4 });
  }

  function packConversionDetails(source, candidate) {
    const sourceQuantity = packQuantityNumber(source);
    const candidateQuantity = packQuantityNumber(candidate);
    if (!sourceQuantity || !candidateQuantity
      || fieldComparable(source, "comparableUnit") !== fieldComparable(candidate, "comparableUnit")) return null;
    const requiredUnits = sourceQuantity;
    const candidatePacks = Math.ceil((requiredUnits / candidateQuantity) - 1e-9);
    const suppliedUnits = candidatePacks * candidateQuantity;
    const excessUnits = Math.max(0, suppliedUnits - requiredUnits);
    const excessPercentage = (excessUnits / requiredUnits) * 100;
    const exact = excessUnits <= 1e-9;
    const withinExcessTolerance = excessPercentage <= OPTIMISATION_CONFIG.maximumExcessPercentage + 1e-9;
    return {
      exact,
      conversionType: exact ? "EXACT" : "ROUND_UP",
      sourcePacks: 1,
      candidatePacks,
      sourceQuantity,
      candidateQuantity,
      requiredUnits,
      suppliedUnits,
      excessUnits,
      excessPercentage,
      withinExcessTolerance,
      equation: exact
        ? `1 × ${compactQuantity(sourceQuantity)} = ${candidatePacks} × ${compactQuantity(candidateQuantity)}`
        : `1 × ${compactQuantity(sourceQuantity)} → ${candidatePacks} × ${compactQuantity(candidateQuantity)} = ${compactQuantity(suppliedUnits)}`,
    };
  }

  function parseStrengthText(value) {
    const textValue = String(value || "");
    const concentration = textValue.match(/(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|g|%|i\.?u\.?|units?|mmol)\s*\/\s*(?:(\d+(?:\.\d+)?)\s*)?(ml|g|dose|spray|actuation|hours?|24\s*hours?|tablets?|capsules?|units?)\b/i);
    if (concentration) {
      const rawPerUnit = normaliseText(concentration[4]);
      const perUnit = rawPerUnit === "hours" ? "hour"
        : rawPerUnit === "24 hour" ? "24 hours"
          : rawPerUnit.replace(/s$/, "");
      return ingredientRecord("", concentration[1], concentration[2], concentration[3] || "1", perUnit);
    }
    const simple = textValue.match(/(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|g|%|i\.?u\.?|units?|mmol)\b/i);
    return simple ? ingredientRecord("", simple[1], simple[2]) : ingredientRecord("");
  }

  function inferIngredients(product) {
    if (Array.isArray(product.cdStructured?.ingredients) && product.cdStructured.ingredients.length) {
      return product.cdStructured.ingredients.map((item) => ingredientRecord(
        item.name, item.strengthValue, item.strengthUnit, item.perValue, item.perUnit,
      ));
    }
    const name = String(product.name || "");
    const combination = name.match(/(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|g|units?|i\.?u\.?|mmol)\s*\/\s*(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|g|units?|i\.?u\.?|mmol)/i);
    const coCodamolShorthand = name.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|g)\b/i);
    if (/\bco[- ]?codamol\b/i.test(name) && (combination || coCodamolShorthand)) {
      const firstValue = combination?.[1] || coCodamolShorthand[1];
      const firstUnit = combination?.[2] || coCodamolShorthand[3];
      const secondValue = combination?.[3] || coCodamolShorthand[2];
      const secondUnit = combination?.[4] || coCodamolShorthand[3];
      return [
        ingredientRecord("Codeine Phosphate", firstValue, firstUnit),
        ingredientRecord("Paracetamol", secondValue, secondUnit),
      ];
    }
    const parsed = parseStrengthText(name);
    parsed.name = inferActiveIngredient(name);
    return [parsed];
  }

  function inferProductDetails(product) {
    const name = String(product.name || "");
    const lowerName = name.toLowerCase();
    const ingredients = inferIngredients(product);
    const primaryIngredient = ingredients[0] || ingredientRecord("");

    let dosageForm = "Other";
    if (/\b(eye drops?|ophthalmic)\b/.test(lowerName)) dosageForm = "Eye Drops";
    else if (/\bear drops?\b/.test(lowerName)) dosageForm = "Ear Drops";
    else if (/\bnasal drops?\b/.test(lowerName)) dosageForm = "Nasal Drops";
    else if (/\bnasal spray\b/.test(lowerName)) dosageForm = "Nasal Spray";
    else if (/\b(infusion)\b/.test(lowerName)) dosageForm = "Infusion";
    else if (/\b(inj(?:ection)?|amps?|ampoules?|vials?|pre[- ]?filled syringes?)\b/.test(lowerName)) dosageForm = "Injection";
    else if (/\bnebul(?:iser|izer|iser solution)\b/.test(lowerName)) dosageForm = "Nebuliser Solution";
    else if (/\b(inhaler|inhalation|accuhaler|turbohaler)\b/.test(lowerName)) dosageForm = "Inhaler";
    else if (/\bointment\b/.test(lowerName)) dosageForm = "Ointment";
    else if (/\bgel\b/.test(lowerName)) dosageForm = "Gel";
    else if (/\blotion\b/.test(lowerName)) dosageForm = "Lotion";
    else if (/\bcream\b/.test(lowerName)) dosageForm = "Cream";
    else if (/\boral spray\b/.test(lowerName)) dosageForm = "Oral Spray";
    else if (/\b(suppos|suppository|suppositories)\b/.test(lowerName)) dosageForm = "Suppository";
    else if (/\bpessar(?:y|ies)\b/.test(lowerName)) dosageForm = "Pessary";
    else if (/\bsusp(?:ension)?\b/.test(lowerName)) dosageForm = "Oral Suspension";
    else if (/\bsyrup\b/.test(lowerName)) dosageForm = "Syrup";
    else if (/\b(oral sol|solution|liquid)\b/.test(lowerName)) dosageForm = "Oral Solution";
    else if (/\b(caps?|capsules?)\b/.test(lowerName)) dosageForm = "Capsule";
    else if (/\bcaplets?\b/.test(lowerName)) dosageForm = "Caplet";
    else if (/\b(tabs?|tablets?)\b/.test(lowerName)) dosageForm = "Tablet";
    else if (/\bpatch(?:es)?\b/.test(lowerName)) dosageForm = "Patch";
    else if (/\bsachets?\b/.test(lowerName)) dosageForm = "Sachet";
    else if (/\bgranules?\b/.test(lowerName)) dosageForm = "Granules";
    else if (/\bpowder\b/.test(lowerName)) dosageForm = "Powder";
    else if (/\b(dressing|protector|catheter|device|bandage|plaster)\b/.test(lowerName)) dosageForm = "Medical Device";

    let route = "Needs Review";
    if (dosageForm === "Eye Drops") route = "Ophthalmic";
    else if (dosageForm === "Ear Drops") route = "Otic / Ear";
    else if (["Nasal Spray", "Nasal Drops"].includes(dosageForm)) route = "Nasal";
    else if (dosageForm === "Injection") route = "Injection";
    else if (["Inhaler", "Nebuliser Solution"].includes(dosageForm)) route = "Inhalation";
    else if (["Cream", "Ointment", "Gel", "Lotion", "Foam", "Emulsion"].includes(dosageForm) || /\bcutaneous\b/.test(lowerName)) route = "Topical";
    else if (dosageForm === "Suppository" || /\brectal\b/.test(lowerName)) route = "Rectal";
    else if (dosageForm === "Pessary") route = "Vaginal";
    else if (dosageForm === "Patch") route = "Transdermal";
    else if (["Tablet", "Caplet", "Capsule", "Oral Solution", "Oral Suspension", "Syrup", "Oral Spray", "Powder", "Granules", "Sachet", "Lozenge", "Mouthwash"].includes(dosageForm)) route = "Oral";

    let releaseType = "Standard";
    if (/\b(g\/r|gr|gast(?:ro)?[- ]?res(?:istant)?)\b/.test(lowerName)) releaseType = "Gastro-resistant";
    else if (/\b(mr|m\/r)\b/.test(lowerName)) releaseType = "Modified Release";
    else if (/\b(pr|p\/r)\b/.test(lowerName)) releaseType = "Prolonged Release";
    else if (/\b(sr|s\/r)\b/.test(lowerName)) releaseType = "Sustained Release";
    else if (/\bxl\b/.test(lowerName)) releaseType = "Extended Release";
    else if (/\bcr\b/.test(lowerName)) releaseType = "Controlled Release";
    else if (/\bla\b/.test(lowerName)) releaseType = "Long Acting";

    let formulationModifier = "None";
    if (/\bfilm[- ]?coated\b/.test(lowerName)) formulationModifier = "Film-coated";
    else if (/\benteric[- ]?coated\b/.test(lowerName)) formulationModifier = "Enteric-coated";
    else if (/\borodispersible\b/.test(lowerName)) formulationModifier = "Orodispersible";
    else if (/\bdispersible\b/.test(lowerName)) formulationModifier = "Dispersible";
    else if (/\bchew(?:able)?\b/.test(lowerName)) formulationModifier = "Chewable";
    else if (/\befferv(?:escent)?\b/.test(lowerName)) formulationModifier = "Effervescent";
    else if (/\bsoluble\b/.test(lowerName)) formulationModifier = "Soluble";
    else if (/\b(?:sf|sugar[- ]?free)\b/.test(lowerName)) formulationModifier = "Sugar-free";

    const packMatches = [...name.matchAll(/\((\d+(?:\.\d+)?)\s*(ml|litres?|l)?\)/gi)];
    const packMatch = packMatches.at(-1);
    let packQuantity = product.cdStructured?.packQuantity || (packMatch ? packMatch[1] : "1");
    if (!packMatch) {
      const trailingPack = name.match(/\b(\d+(?:\.\d+)?)\s*(?:\*PI\*)?\s*$/i);
      if (trailingPack) packQuantity = trailingPack[1];
    }
    let packUnit = "Each";
    if (packMatch?.[2]) {
      packUnit = packMatch[2].toLowerCase() === "ml" ? "ml" : "Units";
    } else if (dosageForm === "Tablet") packUnit = "Tablets";
    else if (dosageForm === "Caplet") packUnit = "Caplets";
    else if (dosageForm === "Capsule") packUnit = "Capsules";
    else if (dosageForm === "Injection") packUnit = "Ampoules";
    else if (dosageForm === "Inhaler") packUnit = "Inhaler";
    else if (dosageForm === "Suppository") packUnit = "Suppositories";
    else if (dosageForm === "Oral Solution" && /\d+\s*ml/i.test(name)) {
      const volume = name.match(/(\d+(?:\.\d+)?)\s*ml/i);
      packQuantity = volume?.[1] || packQuantity;
      packUnit = "ml";
    }

    const structuredSource = product.cdStructured || {};
    dosageForm = structuredSource.dosageForm || dosageForm;
    route = structuredSource.route || route;
    releaseType = structuredSource.releaseType || releaseType;
    formulationModifier = structuredSource.formulationModifier || formulationModifier;
    packQuantity = structuredSource.packQuantity || packQuantity;
    packUnit = structuredSource.packUnit || packUnit;
    const manufacturerMapping = product.pips.find((item) => normaliseText(item.companyType) === "manufacturer") || product.pips[0];
    return {
      ingredients,
      activeIngredient: primaryIngredient.name,
      strengthValue: primaryIngredient.strengthValue,
      strengthUnit: primaryIngredient.strengthUnit,
      dosageForm,
      route,
      releaseType,
      formulationModifier,
      packQuantity: String(packQuantity),
      packSize: String(packQuantity),
      packUnit,
      secondaryQuantity: String(structuredSource.secondaryQuantity || ""),
      secondaryUnit: structuredSource.secondaryUnit || "",
      comparableQuantity: String(structuredSource.comparableQuantity || packQuantity),
      comparableUnit: structuredSource.comparableUnit || packUnit,
      productType: structuredSource.productType || (categoryCodes(product.category).includes("P") ? "PI" : categoryLabel(product.category)),
      structuredDataVerified: Array.isArray(structuredSource.ingredients) && structuredSource.ingredients.length > 0
        && ["dosageForm", "route", "releaseType", "packQuantity", "packUnit"].every((key) => String(structuredSource[key] || "").trim()),
      ...Object.fromEntries(["isParallelImport", "plpiLicenceNumber", "ukReferenceProductId", "piStatus", "mappingStatus", "licenceEffectiveDate", "licenceExpiryDate", "countryOfOrigin"].map((key) => [key, structuredSource[key]])),
      manufacturer: manufacturerMapping?.companyName || "",
      productFamilyId: structuredSource.productFamilyId || structuredSource.productFamily || inferredProductFamilyId({
        ingredients,
        dosageForm,
        route,
        releaseType,
        formulationModifier,
        packUnit,
      }),
      category: product.category,
    };
  }

  let rawCatalogue = [];
  try {
    rawCatalogue = Array.isArray(window.PRODUCT_DATA)
      ? window.PRODUCT_DATA
      : await window.PRODUCT_DATA_PROMISE;
  } catch (error) {
    document.querySelector("#productsBody").innerHTML = '<tr><td class="empty-row" colspan="4">ProductData could not be loaded. Refresh this page and try again.</td></tr>';
    console.error(error);
  }
  const optimisationAdminSeed = window.CascadeOptimisationAdminSeed || { products: [], mappings: [] };
  const rawCatalogueIds = new Set(rawCatalogue.map((record) => String(Array.isArray(record)
    ? record[0]
    : (record.id ?? record.ProductId ?? record["Product ID"]))));
  optimisationAdminSeed.products.forEach((product) => {
    if (!rawCatalogueIds.has(String(product.id))) rawCatalogue.push(product);
  });
  function cdStructuredFromRecord(record) {
    const source = !Array.isArray(record) ? record : (record[5] && typeof record[5] === "object" ? record[5] : null);
    if (!source) return null;
    if (Array.isArray(source.ingredients)) return source;
    const ingredients = [];
    for (let index = 1; index <= 10; index += 1) {
      const name = source[`Ingredient${index}`] ?? source[`ingredient${index}`];
      const strength = source[`Strength${index}`] ?? source[`strength${index}`];
      if (!name && !strength) continue;
      const parsed = parseStrengthText(strength);
      parsed.name = String(name || "").trim();
      ingredients.push(parsed);
    }
    return {
      ingredients,
      packQuantity: source.Quantity ?? source.quantity ?? source.Size ?? source.size ?? "",
      productDescription: source["Product Description"] ?? source.productDescription ?? "",
    };
  }

  const catalogue = rawCatalogue.map((record) => {
    const arrayRecord = Array.isArray(record);
    const pips = arrayRecord ? record[3] : (record.pips || record.Pips || []);
    return {
      id: String(arrayRecord ? record[0] : (record.id ?? record.ProductId ?? record["Product ID"])),
      name: String(arrayRecord ? (record[1] || "") : (record.name ?? record.ProductDescription ?? record["Product Description"] ?? "")),
      category: String(arrayRecord ? (record[2] || "") : (record.category ?? record.PMRCategory ?? record["PMR Category"] ?? "")),
      createdAt: arrayRecord ? (record[4] ? String(record[4]) : "") : String(record.createdAt || record.CreatedAt || ""),
      pips: Array.isArray(pips)
        ? pips.map((pip) => Array.isArray(pip)
          ? { companyName: String(pip[0] || ""), companyType: String(pip[1] || ""), pipCode: String(pip[2] || "") }
          : { companyName: String(pip.companyName || ""), companyType: String(pip.companyType || ""), pipCode: String(pip.pipCode || "") })
        : [],
      cdStructured: cdStructuredFromRecord(record),
    };
  });
  const catalogueById = new Map(catalogue.map((product) => [product.id, product]));
  const inferredDetailsById = new Map();
  const primaryIngredientById = new Map();

  function optimisationSeedMappings() {
    const grouped = {};
    optimisationAdminSeed.mappings.forEach((mapping) => {
      const memberIds = [String(mapping.sourceProductId), String(mapping.replacementProductId)];
      memberIds.forEach((sourceId, index) => {
        grouped[sourceId] ||= { brand: [], pi: [], pack: [] };
        grouped[sourceId][mapping.mappingType].push({
          id: memberIds[index === 0 ? 1 : 0],
          status: mapping.status,
          linkedOn: mapping.linkedOn,
          createdBy: mapping.createdBy,
        });
      });
    });
    return grouped;
  }

  function initialState() {
    return {
      seedVersion: LOCAL_SEED_VERSION,
      page: 1,
      pageSize: 100,
      filter: "",
      searchFilters: { productName: "", category: "", pipCode: "", createdFrom: "", createdTo: "" },
      selectedId: catalogueById.has("147768") ? "147768" : catalogue[0]?.id,
      mainTab: "mapping",
      mappingTab: "brand",
      updates: {
        "147768": { productFamilyId: "PF-00147768" },
        "80872": { productFamilyId: "PF-00147768" },
        "131789": { productFamilyId: "PF-00147768" },
        "80924": { productFamilyId: "PF-00147768" },
      },
      newProducts: [],
      additionalPips: {},
      concessions: {},
      mappings: mergeMappingState(optimisationSeedMappings(), {
        "147768": {
          brand: [
            { id: "80872", status: "Valid", linkedOn: "02 Oct 2026, 17:34", createdBy: CURRENT_USER },
            { id: "131789", status: "Needs Review", linkedOn: "02 Oct 2026, 17:41", createdBy: CURRENT_USER },
          ],
          pi: [],
          pack: [{ id: "80924", status: "Valid", linkedOn: "02 Oct 2026, 17:46", createdBy: CURRENT_USER }],
        },
        "80924": {
          brand: [],
          pi: [],
          pack: [{ id: "147768", status: "Valid", linkedOn: "02 Oct 2026, 17:46", createdBy: CURRENT_USER }],
        },
        "101067": {
          brand: [{ id: "89728", status: "Valid", linkedOn: "05 Oct 2026, 13:00", createdBy: "product-data-migration@luxshtech.com" }],
          pi: [],
          pack: [],
        },
        "89728": {
          brand: [{ id: "101067", status: "Valid", linkedOn: "05 Oct 2026, 13:00", createdBy: "product-data-migration@luxshtech.com" }],
          pi: [],
          pack: [],
        },
        "103758": {
          brand: [{ id: "104666", status: "Valid", linkedOn: "05 Oct 2026, 13:00", createdBy: "product-data-migration@luxshtech.com" }],
          pi: [],
          pack: [],
        },
        "104666": {
          brand: [{ id: "103758", status: "Valid", linkedOn: "05 Oct 2026, 13:00", createdBy: "product-data-migration@luxshtech.com" }],
          pi: [],
          pack: [],
        },
      }),
      audit: {
        "147768": [
          { at: "02 Oct 2026, 17:46", action: "Pack mapping created", details: "Linked Product ID 80924", user: CURRENT_USER },
          { at: "02 Oct 2026, 17:41", action: "Brand mapping created", details: "Linked Product ID 131789 as Needs Review", user: CURRENT_USER },
          { at: "02 Oct 2026, 17:34", action: "Brand mapping created", details: "Linked Product ID 80872", user: CURRENT_USER },
          { at: "02 Oct 2026, 17:20", action: "Product imported", details: "Created from ProductData.xls", user: "System" },
        ],
      },
    };
  }

  function mergeMappingState(defaultMappings, savedMappings) {
    const merged = {};
    const sourceIds = new Set([...Object.keys(defaultMappings || {}), ...Object.keys(savedMappings || {})]);
    sourceIds.forEach((sourceId) => {
      merged[sourceId] = { brand: [], pi: [], pack: [] };
      ["brand", "pi", "pack"].forEach((mappingType) => {
        const byProduct = new Map();
        [...(defaultMappings?.[sourceId]?.[mappingType] || []), ...(savedMappings?.[sourceId]?.[mappingType] || [])]
          .forEach((mapping) => byProduct.set(String(mapping.id), mapping));
        merged[sourceId][mappingType] = [...byProduct.values()];
      });
    });
    return merged;
  }

  function mergeProductUpdates(defaultUpdates, savedUpdates) {
    const merged = {};
    new Set([...Object.keys(defaultUpdates || {}), ...Object.keys(savedUpdates || {})]).forEach((productId) => {
      merged[productId] = { ...(defaultUpdates?.[productId] || {}), ...(savedUpdates?.[productId] || {}) };
    });
    return merged;
  }

  function loadState() {
    const defaults = initialState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return defaults;
      return {
        ...defaults,
        ...saved,
        page: 1,
        filter: "",
        searchFilters: { productName: "", category: "", pipCode: "", createdFrom: "", createdTo: "" },
        mainTab: "mapping",
        mappingTab: "brand",
        updates: mergeProductUpdates(defaults.updates, saved.updates || {}),
        newProducts: saved.newProducts || [],
        additionalPips: saved.additionalPips || {},
        concessions: saved.concessions || {},
        seedVersion: LOCAL_SEED_VERSION,
        mappings: saved.seedVersion === LOCAL_SEED_VERSION
          ? { ...defaults.mappings, ...(saved.mappings || {}) }
          : mergeMappingState(defaults.mappings, saved.mappings || {}),
        audit: { ...defaults.audit, ...(saved.audit || {}) },
      };
    } catch (_error) {
      return defaults;
    }
  }

  const state = loadState();
  const selectedMappingIds = new Set();
  let mappingApiState = "offline";

  function categoryForOptimisationProduct(productType) {
    if (normaliseText(productType) === "brand") return "B";
    if (["pi", "parallel import"].includes(normaliseText(productType))) return "P";
    return "G";
  }

  function optimisationProductUpdate(product) {
    return {
      ...Object.fromEntries(["isParallelImport", "plpiLicenceNumber", "ukReferenceProductId", "piStatus", "mappingStatus", "licenceEffectiveDate", "licenceExpiryDate", "countryOfOrigin"].map((key) => [key, product[key]])),
      structuredDataVerified: product.structuredDataVerified !== false,
      name: product.productName,
      inactive: Boolean(product.inactive),
      ingredients: product.ingredients,
      activeIngredient: product.ingredients?.[0]?.name || "",
      strengthValue: product.strengthValue,
      strengthUnit: product.strengthUnit,
      dosageForm: product.dosageForm,
      route: product.route,
      releaseType: product.releaseType,
      formulationModifier: product.formulationModifier,
      packQuantity: product.packQuantity,
      packSize: product.packQuantity,
      packUnit: product.packUnit,
      secondaryQuantity: product.secondaryQuantity,
      secondaryUnit: product.secondaryUnit,
      comparableQuantity: product.comparableQuantity,
      comparableUnit: product.comparableUnit,
      productType: product.productType,
      productFamilyId: product.productFamily,
      category: categoryForOptimisationProduct(product.productType),
    };
  }

  async function hydrateOptimisationCatalogueFromApi() {
    return;
    if (!/^https?:$/i.test(window.location.protocol)) return;
    const response = await fetch("/api/admin/products/optimisation-catalogue", {
      headers: { "x-authenticated-user": CURRENT_USER },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || "Optimisation products could not be loaded.");
    (payload.data || []).forEach((product) => {
      const id = String(product.productId);
      let base = catalogueById.get(id);
      if (!base) {
        base = {
          id,
          name: product.productName,
          category: categoryForOptimisationProduct(product.productType),
          createdAt: "",
          pips: [],
          cdStructured: product,
        };
        catalogue.push(base);
        catalogueById.set(id, base);
      }
      if (product.pipCode && !base.pips.some((pip) => pip.pipCode === product.pipCode)) {
        base.pips.push({ companyName: "Product Mapping", companyType: "Supplier", pipCode: product.pipCode });
      }
      // Served Admin treats optimisation_product as canonical. Local state is
      // retained only for fields the backend catalogue does not provide.
      state.updates[id] = { ...(state.updates[id] || {}), ...optimisationProductUpdate(product) };
      inferredDetailsById.delete(id);
    });
  }

  async function mappingApi(path = "", options = {}) {
    if (mappingApiState === "offline") return null;
    let response;
    try {
      response = await fetch(`/api/admin/products/mappings${path}`, {
        method: options.method || "GET",
        headers: {
          "content-type": "application/json",
          "x-authenticated-user": CURRENT_USER,
          ...(options.method && options.method !== "GET" ? { "x-csrf-token": document.querySelector('meta[name="csrf-token"]')?.content || "cassy-dev-csrf" } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch (_error) {
      mappingApiState = "offline";
      return null;
    }
    if (response.status === 404 || response.status === 405) {
      mappingApiState = "offline";
      return null;
    }
    mappingApiState = "online";
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || "Product Mapping could not complete the request.");
      error.code = payload.error?.code || "mapping_request_failed";
      error.details = payload.error?.details || null;
      throw error;
    }
    return payload.data;
  }

  async function saveProductMasterApi(productId, product) {
    return null;
    if (!/^https?:$/i.test(window.location.protocol)) return null;
    const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-authenticated-user": CURRENT_USER,
        "x-csrf-token": document.querySelector('meta[name="csrf-token"]')?.content || "cassy-dev-csrf",
      },
      body: JSON.stringify({
        productName: product.name,
        pipCode: product.pipCode || "",
        ...product,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || "Product details could not be saved.");
    return payload.data;
  }

  function productForMappingApi(product) {
    return {
      ...Object.fromEntries(["isParallelImport", "plpiLicenceNumber", "ukReferenceProductId", "piStatus", "mappingStatus", "licenceEffectiveDate", "licenceExpiryDate", "countryOfOrigin"].map((key) => [key, product[key]])),
      productId: product.id, productName: product.name, pipCode: product.pips[0]?.pipCode || "",
      productType: product.productType, inactive: Boolean(product.inactive), structuredDataVerified: product.structuredDataVerified, ingredients: product.ingredients,
      activeIngredient: product.activeIngredient, strengthValue: product.strengthValue, strengthUnit: product.strengthUnit,
      dosageForm: product.dosageForm, route: product.route, releaseType: product.releaseType,
      formulationModifier: product.formulationModifier,
      packQuantity: product.packQuantity, packSize: product.packQuantity, packUnit: product.packUnit,
      secondaryQuantity: product.secondaryQuantity, secondaryUnit: product.secondaryUnit,
      comparableQuantity: product.comparableQuantity || product.secondaryQuantity || product.packQuantity,
      comparableUnit: product.comparableUnit || product.secondaryUnit || product.packUnit,
      productFamily: product.productFamilyId,
    };
  }

  async function hydrateMappingsFromApi() {
    const mappings = await mappingApi();
    if (!mappings) return;
    const grouped = {};
    mappings.forEach((mapping) => {
      grouped[mapping.sourceProductId] ||= { brand: [], pi: [], pack: [] };
      grouped[mapping.sourceProductId][mapping.mappingType].push({
        id: mapping.replacementProductId, serverId: mapping.id, status: mapping.status,
        linkedOn: mapping.linkedOn, createdBy: mapping.createdBy,
      });
    });
    state.mappings = grouped;
    try {
      const response = await fetch("/api/admin/products/mapping-audit", { headers: { "x-authenticated-user": CURRENT_USER } });
      if (response.ok) {
        const { data } = await response.json();
        state.serverPiAudit = data;
      }
    } catch (_) { /* Keep local history when the server is unavailable. */ }
    persistState();
  }
  state.newProducts.forEach((product) => {
    if (catalogueById.has(product.id)) return;
    catalogue.unshift(product);
    catalogueById.set(product.id, product);
  });
  let filteredCatalogue = catalogue;
  let selectedCandidate = null;
  let selectedValidation = null;
  let mappingBeingReviewed = null;
  let selectedBasicProductCategories = new Set();
  let categoryChoices = [];
  let toastTimer = null;

  const elements = {
    body: document.body,
    menuButton: document.querySelector("#menuButton"),
    productsBody: document.querySelector("#productsBody"),
    detailName: document.querySelector("#detailName"),
    detailId: document.querySelector("#detailId"),
    openProductSearch: document.querySelector("#openProductSearch"),
    productSearchDialog: document.querySelector("#productSearchDialog"),
    productSearchForm: document.querySelector("#productSearchForm"),
    productSearchInput: document.querySelector("#productSearchInput"),
    productSearchCategory: document.querySelector("#productSearchCategory"),
    productSearchPip: document.querySelector("#productSearchPip"),
    productSearchCreatedFrom: document.querySelector("#productSearchCreatedFrom"),
    productSearchCreatedTo: document.querySelector("#productSearchCreatedTo"),
    clearProductSearch: document.querySelector("#clearProductSearch"),
    exportProducts: document.querySelector("#exportProducts"),
    newProductButton: document.querySelector("#newProductButton"),
    refreshProducts: document.querySelector("#refreshProducts"),
    firstPage: document.querySelector("#firstPage"),
    previousPage: document.querySelector("#previousPage"),
    pageNumber: document.querySelector("#pageNumber"),
    totalPages: document.querySelector("#totalPages"),
    nextPage: document.querySelector("#nextPage"),
    lastPage: document.querySelector("#lastPage"),
    pageSize: document.querySelector("#pageSize"),
    editBasicProduct: document.querySelector("#editBasicProduct"),
    inactiveCheckbox: document.querySelector("#inactiveCheckbox"),
    basicProductForm: document.querySelector("#basicProductForm"),
    basicFormActions: document.querySelector("#basicFormActions"),
    basicProductError: document.querySelector("#basicProductError"),
    ingredientRows: document.querySelector("#ingredientRows"),
    addIngredient: document.querySelector("#addIngredient"),
    ingredientOptions: document.querySelector("#ingredientOptions"),
    secondaryPackGroup: document.querySelector("#secondaryPackGroup"),
    category: document.querySelector("#category"),
    categoryValue: document.querySelector("#categoryValue"),
    basicCategoryMenu: document.querySelector("#basicCategoryMenu"),
    basicCategoryOptions: document.querySelector("#basicCategoryOptions"),
    cancelBasicProduct: document.querySelector("#cancelBasicProduct"),
    manufacturerOptions: document.querySelector("#manufacturerOptions"),
    categoryOptions: document.querySelector("#categoryOptions"),
    pipCodesBody: document.querySelector("#pipCodesBody"),
    newPipCode: document.querySelector("#newPipCode"),
    uploadPipExcel: document.querySelector("#uploadPipExcel"),
    brandCount: document.querySelector("#brandCount"),
    piCount: document.querySelector("#piCount"),
    packCount: document.querySelector("#packCount"),
    mappingHeading: document.querySelector("#mappingHeading"),
    mappingDescription: document.querySelector("#mappingDescription"),
    addMappingButton: document.querySelector("#addMappingButton"),
    unlinkMappingsButton: document.querySelector("#unlinkMappingsButton"),
    selectAllMappings: document.querySelector("#selectAllMappings"),
    mappingBody: document.querySelector("#mappingBody"),
    concessionCheckbox: document.querySelector("#concessionCheckbox"),
    auditBody: document.querySelector("#auditBody"),
    mappingDialog: document.querySelector("#mappingDialog"),
    mappingDialogForm: document.querySelector("#mappingDialogForm"),
    mappingDialogTitle: document.querySelector("#mappingDialogTitle"),
    mappingDialogHelp: document.querySelector("#mappingDialogHelp"),
    mappingSearchInput: document.querySelector("#mappingSearchInput"),
    mappingSearchButton: document.querySelector("#mappingSearchButton"),
    mappingResultsTitle: document.querySelector("#mappingResultsTitle"),
    mappingResultsHint: document.querySelector("#mappingResultsHint"),
    mappingResultsBody: document.querySelector("#mappingResultsBody"),
    selectedProductDetails: document.querySelector("#selectedProductDetails"),
    selectedProductSummary: document.querySelector("#selectedProductSummary"),
    comparisonGrid: document.querySelector("#comparisonGrid"),
    validationMessage: document.querySelector("#validationMessage"),
    reviewConfirmation: document.querySelector("#reviewConfirmation"),
    reviewAcknowledgement: document.querySelector("#reviewAcknowledgement"),
    confirmAddMapping: document.querySelector("#confirmAddMapping"),
    pipDialog: document.querySelector("#pipDialog"),
    pipDialogForm: document.querySelector("#pipDialogForm"),
    pipProductId: document.querySelector("#pipProductId"),
    pipCodeInput: document.querySelector("#pipCodeInput"),
    pipCompanyType: document.querySelector("#pipCompanyType"),
    pipCompanyName: document.querySelector("#pipCompanyName"),
    pipFormError: document.querySelector("#pipFormError"),
    importDialog: document.querySelector("#importDialog"),
    importDialogForm: document.querySelector("#importDialogForm"),
    pipImportFile: document.querySelector("#pipImportFile"),
    importReview: document.querySelector("#importReview"),
    importReviewConfirmation: document.querySelector("#importReviewConfirmation"),
    importReviewCheckbox: document.querySelector("#importReviewCheckbox"),
    confirmImport: document.querySelector("#confirmImport"),
    newProductDialog: document.querySelector("#newProductDialog"),
    newProductForm: document.querySelector("#newProductForm"),
    newProductName: document.querySelector("#newProductName"),
    newProductCategory: document.querySelector("#newProductCategory"),
    newProductCategoryValue: document.querySelector("#newProductCategoryValue"),
    newProductCategoryMenu: document.querySelector("#newProductCategoryMenu"),
    newProductCategoryOptions: document.querySelector("#newProductCategoryOptions"),
    closeNewProduct: document.querySelector("#closeNewProduct"),
    cancelNewProduct: document.querySelector("#cancelNewProduct"),
    newProductError: document.querySelector("#newProductError"),
    toast: document.querySelector("#toast"),
  };

  const basicFieldIds = [
    "productName", "dosageForm", "dosageFormOther", "route", "routeOther",
    "releaseType", "releaseTypeOther", "formulationModifier", "formulationModifierOther",
    "packQuantity", "packUnit", "secondaryQuantity", "secondaryUnit", "productType",
  ];
  let basicEditing = false;
  let selectedNewProductCategories = new Set();
  const knownIngredientNames = new Set(Object.values(BRAND_ACTIVE_INGREDIENTS));

  function refreshIngredientOptions() {
    Object.values(state.updates).forEach((update) => {
      (update.ingredients || []).forEach((item) => { if (item.name) knownIngredientNames.add(item.name); });
      if (update.activeIngredient) knownIngredientNames.add(update.activeIngredient);
    });
    elements.ingredientOptions.innerHTML = [...knownIngredientNames]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        seedVersion: state.seedVersion,
        selectedId: state.selectedId,
        pageSize: state.pageSize,
        updates: state.updates,
        newProducts: state.newProducts,
        additionalPips: state.additionalPips,
        concessions: state.concessions,
        mappings: state.mappings,
        audit: state.audit,
      }));
    } catch (_error) {
      // The prototype remains usable if local storage is unavailable.
    }
  }

  function showToast(message, type = "success") {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", type === "error");
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3600);
  }

  function addAudit(productId, action, details) {
    state.audit[productId] ||= [];
    state.audit[productId].unshift({ at: nowLabel(), action, details, user: CURRENT_USER });
  }

  function getBaseProduct(id) {
    return catalogueById.get(String(id));
  }

  function structuredProduct(product) {
    const ingredients = Array.isArray(product.ingredients) && product.ingredients.length
      ? product.ingredients.map((item) => ingredientRecord(item.name, item.strengthValue, item.strengthUnit, item.perValue, item.perUnit))
      : [ingredientRecord(product.activeIngredient, product.strengthValue, product.strengthUnit, product.perValue, product.perUnit)];
    const packQuantity = String(product.packQuantity ?? product.packSize ?? "").trim();
    const packUnit = normaliseSolidPackUnit(product.dosageForm, product.packUnit);
    return {
      ...product,
      ingredients,
      activeIngredient: ingredients[0]?.name || "",
      strengthValue: ingredients[0]?.strengthValue || "",
      strengthUnit: ingredients[0]?.strengthUnit || "mg",
      perValue: ingredients[0]?.perValue || "",
      perUnit: ingredients[0]?.perUnit || "",
      packQuantity,
      packSize: packQuantity,
      packUnit,
      formulationModifier: product.formulationModifier || "None",
      secondaryQuantity: String(product.secondaryQuantity || ""),
      secondaryUnit: product.secondaryUnit || "",
    };
  }

  function getProduct(id) {
    const base = getBaseProduct(id);
    if (!base) return null;
    const savedUpdate = state.updates[base.id] || {};
    const productWithExtraPips = {
      ...base,
      pips: [...base.pips, ...(state.additionalPips[base.id] || [])],
    };
    let inferred = inferredDetailsById.get(base.id);
    if (!inferred) {
      inferred = inferProductDetails(productWithExtraPips);
      inferredDetailsById.set(base.id, inferred);
    }
    const merged = {
      ...productWithExtraPips,
      ...inferred,
      ...savedUpdate,
      concession: Boolean(state.concessions[base.id]),
    };
    const hasLegacyIngredientUpdate = !Object.hasOwn(savedUpdate, "ingredients")
      && ["activeIngredient", "strengthValue", "strengthUnit", "perValue", "perUnit"].some((key) => Object.hasOwn(savedUpdate, key));
    if (hasLegacyIngredientUpdate) {
      const legacyStrength = String(savedUpdate.strengthValue ?? inferred.strengthValue ?? "");
      const parsed = parseStrengthText(legacyStrength);
      const confidentlySplit = /^\d+(?:\.\d+)?$/.test(legacyStrength);
      merged.ingredients = [ingredientRecord(
        savedUpdate.activeIngredient ?? inferred.activeIngredient,
        confidentlySplit ? legacyStrength : parsed.strengthValue,
        savedUpdate.strengthUnit || parsed.strengthUnit,
        savedUpdate.perValue || parsed.perValue,
        savedUpdate.perUnit || parsed.perUnit,
      )];
      if (!confidentlySplit) {
        merged.legacyStrengthText = legacyStrength;
      }
    }
    if (!Object.hasOwn(savedUpdate, "packQuantity") && Object.hasOwn(savedUpdate, "packSize")) {
      merged.packQuantity = savedUpdate.packSize;
    }
    const structured = structuredProduct(merged);
    if (!Object.hasOwn(savedUpdate, "productFamilyId")) {
      structured.productFamilyId = inferredProductFamilyId(structured);
    }
    return structured;
  }

  function selectedProduct() {
    return getProduct(state.selectedId);
  }

  function productSearchText(product) {
    const updates = state.updates[product.id] || {};
    return `${product.id} ${updates.name || product.name} ${updates.category || product.category} ${product.pips.map((pip) => `${pip.pipCode} ${pip.companyName}`).join(" ")}`.toLowerCase();
  }

  function updateFilter() {
    const filters = state.searchFilters || {};
    const productName = normaliseText(filters.productName || state.filter);
    const category = String(filters.category || "").toUpperCase();
    const pipCode = normaliseText(filters.pipCode);
    const createdFrom = String(filters.createdFrom || "");
    const createdTo = String(filters.createdTo || "");
    const hasFilters = Boolean(productName || category || pipCode || createdFrom || createdTo);
    filteredCatalogue = hasFilters ? catalogue.filter((base) => {
      const update = state.updates[base.id] || {};
      const name = update.name || base.name;
      const productCategory = update.category || base.category;
      const pips = [...base.pips, ...(state.additionalPips[base.id] || [])];
      const matchesName = !productName || normaliseText(`${base.id} ${name}`).includes(productName);
      const matchesCategory = !category || categoryCodes(productCategory).includes(category);
      const matchesPip = !pipCode || pips.some((pip) => normaliseText(pip.pipCode).includes(pipCode));
      const createdDate = String(base.createdAt || "").slice(0, 10);
      const matchesFrom = !createdFrom || (createdDate && createdDate >= createdFrom);
      const matchesTo = !createdTo || (createdDate && createdDate <= createdTo);
      return matchesName && matchesCategory && matchesPip && matchesFrom && matchesTo;
    }) : catalogue;
    const totalPages = Math.max(1, Math.ceil(filteredCatalogue.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
  }

  function renderProducts() {
    updateFilter();
    const start = (state.page - 1) * state.pageSize;
    const pageProducts = filteredCatalogue.slice(start, start + state.pageSize);
    elements.productsBody.innerHTML = pageProducts.length
      ? pageProducts.map((base) => {
        const product = getProduct(base.id);
        return `
          <tr data-product-id="${escapeHtml(product.id)}" class="${product.id === state.selectedId ? "selected" : ""}">
            <td><button class="edit-btn" data-edit-product="${escapeHtml(product.id)}" type="button" aria-label="Edit ${escapeHtml(product.name)}"><svg class="edit-icon" aria-hidden="true"><use href="#editIcon"></use></svg></button></td>
            <td>${escapeHtml(product.id)}</td>
            <td title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</td>
            <td>${escapeHtml(product.category)}</td>
          </tr>`;
      }).join("")
      : '<tr><td class="empty-row" colspan="4">No products match the current search.</td></tr>';

    const totalPages = Math.max(1, Math.ceil(filteredCatalogue.length / state.pageSize));
    elements.pageNumber.value = String(state.page);
    elements.pageNumber.max = String(totalPages);
    elements.totalPages.textContent = String(totalPages);
    elements.firstPage.disabled = state.page <= 1;
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;
    elements.lastPage.disabled = state.page >= totalPages;
    elements.pageSize.value = String(state.pageSize);
  }

  function ensureSelectValue(select, value) {
    if (!value && [...select.options].some((option) => option.value === "")) {
      select.value = "";
      return;
    }
    if (![...select.options].some((option) => option.value === value)) {
      select.add(new Option(value, value));
    }
    select.value = value;
  }

  function ingredientRowMarkup(ingredient, index) {
    const hasPer = Boolean(ingredient.perValue || ingredient.perUnit);
    const optionMarkup = (values, selected, includeBlank = false) => `${includeBlank ? '<option value=""></option>' : ""}${values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
    return `
      <div class="ingredient-row" data-ingredient-index="${index}">
        <div class="ingredient-row-title">Ingredient ${index + 1}</div>
        <div class="ingredient-control ingredient-name-control">
          <label for="ingredientName${index}">Active Ingredient</label>
          <input id="ingredientName${index}" class="ingredient-name" list="ingredientOptions" type="text" value="${escapeHtml(ingredient.name)}" ${basicEditing ? "" : "disabled"} />
        </div>
        <div class="ingredient-control strength-value-control">
          <label for="ingredientStrengthValue${index}">Strength Value</label>
          <input id="ingredientStrengthValue${index}" class="ingredient-strength-value" type="number" min="0" step="any" inputmode="decimal" value="${escapeHtml(ingredient.strengthValue)}" ${basicEditing ? "" : "disabled"} />
        </div>
        <div class="ingredient-control strength-unit-control">
          <label for="ingredientStrengthUnit${index}">Strength Unit</label>
          <select id="ingredientStrengthUnit${index}" class="ingredient-strength-unit" ${basicEditing ? "" : "disabled"}>${optionMarkup(STRENGTH_UNITS, ingredient.strengthUnit)}</select>
        </div>
        <div class="ingredient-per-fields" ${hasPer ? "" : "hidden"}>
          <div class="ingredient-control">
            <label for="ingredientPerValue${index}">Per Value</label>
            <input id="ingredientPerValue${index}" class="ingredient-per-value" type="number" min="0" step="any" inputmode="decimal" value="${escapeHtml(ingredient.perValue)}" ${basicEditing ? "" : "disabled"} />
          </div>
          <div class="ingredient-control">
            <label for="ingredientPerUnit${index}">Per Unit</label>
            <select id="ingredientPerUnit${index}" class="ingredient-per-unit" ${basicEditing ? "" : "disabled"}>${optionMarkup(PER_UNITS, ingredient.perUnit, true)}</select>
          </div>
        </div>
        <div class="ingredient-row-actions" ${basicEditing ? "" : "hidden"}>
          <button class="ingredient-action add-per-button" type="button" ${hasPer ? "hidden" : ""}>+ Per</button>
          <button class="ingredient-action remove-ingredient-button" type="button" ${index === 0 && elements.ingredientRows.children.length <= 1 ? "hidden" : ""}>Remove</button>
        </div>
      </div>`;
  }

  function renderIngredientRows(ingredients) {
    const rows = ingredients?.length ? ingredients : [ingredientRecord("")];
    elements.ingredientRows.innerHTML = rows.map(ingredientRowMarkup).join("");
    rows.forEach((item) => { if (item.name) knownIngredientNames.add(item.name); });
    refreshIngredientOptions();
    elements.ingredientRows.querySelectorAll(".remove-ingredient-button").forEach((button) => {
      button.hidden = !basicEditing || elements.ingredientRows.children.length === 1;
    });
  }

  function updateConditionalBasicFields() {
    ["dosageForm", "route", "releaseType", "formulationModifier"].forEach((fieldId) => {
      const group = document.getElementById(`${fieldId}OtherGroup`);
      if (group) group.hidden = document.getElementById(fieldId).value !== "Other";
    });
    const secondaryQuantity = document.getElementById("secondaryQuantity").value;
    const secondaryUnit = document.getElementById("secondaryUnit").value;
    elements.secondaryPackGroup.hidden = !basicEditing && !secondaryQuantity && !secondaryUnit;
  }

  document.getElementById("productType").addEventListener("change", updateConditionalBasicFields);

  function setBasicFields(product) {
    elements.inactiveCheckbox.checked = Boolean(product.inactive);
    basicFieldIds.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (!field) return;
      const property = fieldId === "productName" ? "name" : fieldId;
      if (field.tagName === "SELECT") ensureSelectValue(field, String(product[property] ?? ""));
      else field.value = String(product[property] ?? "");
    });
    renderIngredientRows(product.ingredients);
    selectedBasicProductCategories = new Set(categoryCodes(product.category));
    renderBasicProductCategoryPicker();
    updateConditionalBasicFields();
  }

  function setBasicEditMode(editing) {
    basicEditing = editing;
    elements.inactiveCheckbox.disabled = !editing;
    basicFieldIds.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (!field) return;
      field.disabled = !editing;
    });
    elements.addIngredient.hidden = !editing;
    if (editing) {
      renderIngredientRows(selectedProduct()?.ingredients || []);
    } else {
      elements.ingredientRows.querySelectorAll("input, select").forEach((field) => { field.disabled = true; });
      elements.ingredientRows.querySelectorAll(".ingredient-row-actions").forEach((actions) => { actions.hidden = true; });
    }
    elements.category.disabled = !editing;
    if (!editing) closeBasicCategoryMenu();
    elements.basicProductError.textContent = "";
    elements.basicFormActions.hidden = !editing;
    elements.editBasicProduct.hidden = editing;
    updateConditionalBasicFields();
  }

  function renderBasicProductCategoryPicker() {
    const selectedCodes = [...selectedBasicProductCategories].sort();
    elements.categoryValue.textContent = selectedCodes.length
      ? categoryDisplay(selectedCodes.join(","))
      : "Select PMR categories";
    const choices = [...new Set([...categoryChoices, ...selectedCodes])].sort();
    elements.basicCategoryOptions.innerHTML = choices.map((code) => {
      const selected = selectedBasicProductCategories.has(code);
      return `
        <button class="basic-category-option ${selected ? "selected" : ""}" type="button" role="option" aria-selected="${String(selected)}" data-basic-product-category="${escapeHtml(code)}">
          <span>${escapeHtml(code)} - ${escapeHtml(categoryCodeLabel(code))}</span><span aria-hidden="true">${selected ? "&#10003;" : ""}</span>
        </button>`;
    }).join("");
  }

  function closeBasicCategoryMenu() {
    elements.basicCategoryMenu.hidden = true;
    elements.category.setAttribute("aria-expanded", "false");
  }

  function renderPipCodes() {
    const product = selectedProduct();
    elements.pipCodesBody.innerHTML = product.pips.length
      ? product.pips.map((pip, index) => `
          <tr>
            <td><button class="edit-btn" type="button" data-edit-pip="${index}" aria-label="Edit PIP code ${escapeHtml(pip.pipCode)}"><svg class="edit-icon" aria-hidden="true"><use href="#editIcon"></use></svg></button></td>
            <td>${escapeHtml(pip.companyType || "-")}</td>
            <td>${escapeHtml(pip.companyName || "-")}</td>
            <td>${escapeHtml(pip.pipCode || "-")}</td>
          </tr>`).join("")
      : '<tr><td class="empty-row" colspan="4">No PIP codes are recorded for this product.</td></tr>';
  }

  function mappingsFor(productId, mappingType) {
    state.mappings[productId] ||= { brand: [], pi: [], pack: [] };
    state.mappings[productId][mappingType] ||= [];
    return state.mappings[productId][mappingType];
  }

  function packLabel(product) {
    const primary = `${product.packQuantity || product.packSize || "-"} ${product.packUnit || ""}`.trim();
    const secondary = product.secondaryQuantity || product.secondaryUnit
      ? `; ${product.secondaryQuantity || "-"} ${product.secondaryUnit || ""}`.trim()
      : "";
    return `${primary}${secondary}`;
  }

  function updateMappingSelectionControls() {
    const checkboxes = [...elements.mappingBody.querySelectorAll("[data-select-mapping]")];
    const availableIds = new Set(checkboxes.map((checkbox) => checkbox.dataset.selectMapping));
    [...selectedMappingIds].forEach((id) => {
      if (!availableIds.has(id)) selectedMappingIds.delete(id);
    });
    checkboxes.forEach((checkbox) => {
      const selected = selectedMappingIds.has(checkbox.dataset.selectMapping);
      checkbox.checked = selected;
      checkbox.closest("tr")?.classList.toggle("selected", selected);
    });
    const selectedCount = selectedMappingIds.size;
    elements.selectAllMappings.disabled = checkboxes.length === 0;
    elements.selectAllMappings.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
    elements.selectAllMappings.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
    elements.unlinkMappingsButton.disabled = selectedCount === 0;
    elements.unlinkMappingsButton.setAttribute(
      "aria-label",
      selectedCount ? `Unlink ${selectedCount} selected product${selectedCount === 1 ? "" : "s"}` : "Unlink selected products",
    );
  }

  function renderMapping() {
    selectedMappingIds.clear();
    const config = MAPPING_CONFIG[state.mappingTab];
    const selectedId = state.selectedId;
    const brandMappings = mappingsFor(selectedId, "brand");
    const piMappings = mappingsFor(selectedId, "pi");
    const packMappings = mappingsFor(selectedId, "pack");
    elements.brandCount.textContent = `(${brandMappings.length})`;
    elements.piCount.textContent = `(${piMappings.length})`;
    elements.packCount.textContent = `(${packMappings.length})`;
    const currentMappings = mappingsFor(selectedId, state.mappingTab);
    const piCurrent = state.mappingTab === "pi" && window.CascadeOptimisationValidation.isPI(selectedProduct());
    elements.mappingHeading.textContent = piCurrent ? "UK Reference Product" : `${config.heading} (${currentMappings.length})`;
    elements.mappingDescription.textContent = piCurrent ? "The UK reference linked to this PI product." : config.description;
    elements.addMappingButton.querySelector("span:last-child").textContent = piCurrent ? (currentMappings.length ? "Change Reference" : "Set UK Reference Product") : config.action;
    document.querySelector(".mapping-table thead th:last-child").textContent = state.mappingTab === "pi" ? "Status / Action" : "Linked On";

    const rows = currentMappings.map((mapping) => {
      const product = getProduct(mapping.id);
      if (!product) return "";
      return `
        <tr data-mapping-row="${escapeHtml(mapping.id)}">
          <td class="mapping-select-col"><input type="checkbox" data-select-mapping="${escapeHtml(mapping.id)}" aria-label="Select ${escapeHtml(product.name)}" /></td>
          <td>${escapeHtml(product.id)}</td>
          <td title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</td>
          <td>${escapeHtml(product.productType)}</td>
          <td>${escapeHtml(packLabel(product))}</td>
          <td>${state.mappingTab === "pi" ? `${escapeHtml(mapping.status)} ${mapping.status !== "Validated" ? `<button type="button" data-review-pi="${escapeHtml(mapping.id)}">Review</button>` : ""}` : escapeHtml(dateTimeLabel(mapping.linkedOn))}</td>
        </tr>`;
    }).join("");
    elements.mappingBody.innerHTML = rows || '<tr><td class="empty-row" colspan="6">No equivalent products are linked.</td></tr>';
    updateMappingSelectionControls();
  }

  function renderAudit() {
    const serverEntries = (state.serverPiAudit || []).filter((item) => item.source_product_id === state.selectedId || item.replacement_product_id === state.selectedId).map((item) => ({
      at: dateTimeLabel(item.performed_at), user: item.performed_by,
      action: ({ created: "PI relationship created", reference_changed: "Reference product changed", group_created: "PI mapping created", member_added: "PI mapping created", removed: "PI mapping removed", needs_review: "PI mapping moved to Needs Review", reviewed: "PI mapping revalidated", invalid: "PI mapping marked Invalid" })[item.action] || `PI mapping ${item.action}`,
      details: `${item.source_product_id} ${item.source_product_name || ""} ? ${item.replacement_product_id} ${item.replacement_product_name || ""} | ${item.previous_status || "?"} ? ${item.new_status || "?"} | ${item.reason || ""}`,
    }));
    const entries = [...serverEntries, ...(state.audit[state.selectedId] || [])];
    elements.auditBody.innerHTML = entries.length
      ? entries.map((entry) => `
          <tr><td>${escapeHtml(entry.at)}</td><td>${escapeHtml(entry.action)}</td><td title="${escapeHtml(entry.details)}">${escapeHtml(entry.details)}</td><td>${escapeHtml(entry.user)}</td></tr>`).join("")
      : '<tr><td class="empty-row" colspan="4">No changes have been recorded for this product.</td></tr>';
  }

  function renderTabs() {
    document.querySelectorAll("[data-main-tab]").forEach((tab) => {
      const active = tab.dataset.mainTab === state.mainTab;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-main-panel]").forEach((panel) => {
      const active = panel.dataset.mainPanel === state.mainTab;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-mapping-tab]").forEach((tab) => {
      const active = tab.dataset.mappingTab === state.mappingTab;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
  }

  function renderDetails() {
    const product = selectedProduct();
    if (!product) return;
    elements.detailName.textContent = `Product Name - ${product.name}`;
    elements.detailId.textContent = `Product Id - ${product.id}`;
    setBasicFields(product);
    setBasicEditMode(false);
    elements.concessionCheckbox.checked = product.concession;
    renderPipCodes();
    renderMapping();
    renderAudit();
    renderTabs();
  }

  function selectProduct(id, options = {}) {
    if (!catalogueById.has(String(id))) return;
    state.selectedId = String(id);
    persistState();
    renderProducts();
    renderDetails();
    if (options.basicEdit) beginBasicEdit();
  }

  function beginBasicEdit() {
    setBasicEditMode(true);
    document.getElementById("productName").focus();
  }

  function collectIngredients() {
    return [...elements.ingredientRows.querySelectorAll(".ingredient-row")].map((row) => ingredientRecord(
      row.querySelector(".ingredient-name").value,
      row.querySelector(".ingredient-strength-value").value,
      row.querySelector(".ingredient-strength-unit").value,
      row.querySelector(".ingredient-per-value")?.value || "",
      row.querySelector(".ingredient-per-unit")?.value || "",
    ));
  }

  function ingredientsLabel(ingredients) {
    return (ingredients || []).map((item) => {
      const strength = `${item.strengthValue || "?"} ${item.strengthUnit || ""}`.trim();
      const per = item.perValue || item.perUnit ? ` / ${item.perValue || "1"} ${item.perUnit || "?"}` : "";
      return `${item.name || "Not recorded"} - ${strength}${per}`;
    }).join("; ");
  }

  function markMappingsForReview(productId) {
    let affected = 0;
    Object.entries(state.mappings).forEach(([sourceId, types]) => {
      Object.values(types).forEach((entries) => entries.forEach((mapping) => {
        if (sourceId === productId || mapping.id === productId) {
          if (mapping.status !== "Needs Review") affected += 1;
          mapping.status = "Needs Review";
        }
      }));
    });
    return affected;
  }

  async function saveBasicProduct(event) {
    event.preventDefault();
    const before = selectedProduct();
    const next = { inactive: elements.inactiveCheckbox.checked, structuredDataVerified: true };
    basicFieldIds.forEach((fieldId) => {
      const property = fieldId === "productName" ? "name" : fieldId;
      next[property] = document.getElementById(fieldId).value.trim();
    });
    next.isParallelImport = next.productType === "PI";
    next.ingredients = collectIngredients();
    next.activeIngredient = next.ingredients[0]?.name || "";
    next.strengthValue = next.ingredients[0]?.strengthValue || "";
    next.strengthUnit = next.ingredients[0]?.strengthUnit || "";
    next.perValue = next.ingredients[0]?.perValue || "";
    next.perUnit = next.ingredients[0]?.perUnit || "";
    next.packSize = next.packQuantity;
    next.packUnit = normaliseSolidPackUnit(next.dosageForm, next.packUnit);
    if (!next.name) {
      elements.basicProductError.textContent = "Product Name is required.";
      document.getElementById("productName").focus();
      return;
    }
    if (!selectedBasicProductCategories.size) {
      elements.basicProductError.textContent = "Select at least one PMR Category.";
      return;
    }
    if (!next.productType) {
      elements.basicProductError.textContent = "Product Type is required.";
      document.getElementById("productType").focus();
      return;
    }
    const invalidIngredient = next.ingredients.find((ingredient) => !ingredient.name || !ingredient.strengthValue
      || !ingredient.strengthUnit || !Number.isFinite(Number(ingredient.strengthValue)) || Number(ingredient.strengthValue) <= 0);
    if (invalidIngredient) {
      elements.basicProductError.textContent = "Every ingredient requires an Active Ingredient, numeric Strength Value and Strength Unit.";
      return;
    }
    const invalidPer = next.ingredients.find((ingredient) => Boolean(ingredient.perValue) !== Boolean(ingredient.perUnit));
    if (invalidPer) {
      elements.basicProductError.textContent = "Per Value and Per Unit must be entered together.";
      return;
    }
    if (next.ingredients.some((ingredient) => ingredient.perValue && (!Number.isFinite(Number(ingredient.perValue)) || Number(ingredient.perValue) <= 0))) {
      elements.basicProductError.textContent = "Per Value must be a number greater than zero.";
      return;
    }
    if (!next.packQuantity || Number(next.packQuantity) <= 0) {
      elements.basicProductError.textContent = "Pack Quantity must be a number greater than zero.";
      document.getElementById("packQuantity").focus();
      return;
    }
    if (Boolean(next.secondaryQuantity) !== Boolean(next.secondaryUnit)) {
      elements.basicProductError.textContent = "Secondary Quantity and Secondary Unit must be entered together.";
      return;
    }
    if (next.secondaryQuantity && (!Number.isFinite(Number(next.secondaryQuantity)) || Number(next.secondaryQuantity) <= 0)) {
      elements.basicProductError.textContent = "Secondary Quantity must be a number greater than zero.";
      return;
    }
    for (const fieldId of ["dosageForm", "route", "releaseType", "formulationModifier"]) {
      if (next[fieldId] === "Other" && !next[`${fieldId}Other`]) {
        elements.basicProductError.textContent = `Enter a description for Other ${document.querySelector(`label[for="${fieldId}"]`).textContent}.`;
        document.getElementById(`${fieldId}Other`).focus();
        return;
      }
    }
    next.category = [...selectedBasicProductCategories].sort().join(",");
    try {
      await saveProductMasterApi(state.selectedId, { ...next, pipCode: before.pips[0]?.pipCode || "" });
    } catch (error) {
      elements.basicProductError.textContent = error.message;
      return;
    }
    state.updates[state.selectedId] = { ...(state.updates[state.selectedId] || {}), ...next };
    const auditFields = [
      ["ingredients", "Ingredient / Strength", ingredientsLabel(before.ingredients), ingredientsLabel(next.ingredients)],
      ["dosageForm", "Dosage Form", before.dosageForm, next.dosageForm],
      ["route", "Route", before.route, next.route],
      ["releaseType", "Release Type", before.releaseType, next.releaseType],
      ["formulationModifier", "Formulation Modifier", before.formulationModifier, next.formulationModifier],
      ["pack", "Pack Size", packLabel(before), `${next.packQuantity} ${next.packUnit}${next.secondaryQuantity ? `; ${next.secondaryQuantity} ${next.secondaryUnit}` : ""}`],
      ["productType", "Product Type", before.productType, next.productType],
      ["inactive", "Inactive", before.inactive ? "Yes" : "No", next.inactive ? "Yes" : "No"],
    ];
    const changed = auditFields.filter(([, , previous, current]) => normaliseText(previous) !== normaliseText(current));
    changed.forEach(([, label, previous, current]) => addAudit(
      state.selectedId,
      `${label} changed`,
      `Previous Value: ${previous || "Not recorded"} | New Value: ${current || "Not recorded"}`,
    ));
    if (String(before.name) !== next.name) addAudit(state.selectedId, "Product Name changed", `Previous Value: ${before.name} | New Value: ${next.name}`);
    if (String(before.category) !== next.category) addAudit(state.selectedId, "PMR Category changed", `Previous Value: ${categoryDisplay(before.category)} | New Value: ${categoryDisplay(next.category)}`);
    const coreChanged = changed.length > 0;
    if (coreChanged) {
      const affected = markMappingsForReview(state.selectedId);
      if (affected) addAudit(state.selectedId, "Mappings require revalidation", `${affected} existing mapping${affected === 1 ? "" : "s"} flagged Needs Review after core equivalence data changed.`);
    }
    if (!changed.length && String(before.name) === next.name && String(before.category) === next.category) {
      addAudit(state.selectedId, "Product details reviewed", "No field values changed");
    }
    persistState();
    renderProducts();
    renderDetails();
    showToast("Basic Product Information saved.");
  }

  function fieldComparable(product, field) {
    if (field === "ingredients") return (product.ingredients || []).map((item) => normaliseText(`${item.name}|${item.strengthValue}|${item.strengthUnit}|${item.perValue}|${item.perUnit}`)).sort().join(";");
    if (field === "pack") return normaliseText(`${product.packQuantity}|${product.packUnit}|${product.secondaryQuantity}|${product.secondaryUnit}`);
    if (field === "comparableUnit") return normaliseText(product.secondaryUnit || product.packUnit).replace(/s$/, "");
    return normaliseText(product[field]);
  }

  function validateCandidate(source, candidate, mappingType, options = {}) {
    const checks = [
      { key: "ingredients", label: "Ingredient(s) / Strength(s)", source: ingredientsLabel(source.ingredients), candidate: ingredientsLabel(candidate.ingredients) },
      { key: "dosageForm", label: "Dosage Form", source: source.dosageForm, candidate: candidate.dosageForm },
      { key: "route", label: "Route", source: source.route, candidate: candidate.route },
      { key: "releaseType", label: "Release Type", source: source.releaseType, candidate: candidate.releaseType },
      { key: "formulationModifier", label: "Formulation Modifier", source: source.formulationModifier || "None", candidate: candidate.formulationModifier || "None" },
      { key: "comparableUnit", label: "Comparable Pack Unit", source: source.secondaryUnit || source.packUnit, candidate: candidate.secondaryUnit || candidate.packUnit },
      { key: "pack", label: "Pack Size", source: packLabel(source), candidate: packLabel(candidate) },
    ].map((check) => {
      const matches = fieldComparable(source, check.key) === fieldComparable(candidate, check.key);
      return {
        ...check,
        matches,
        expectedDifference: mappingType === "pack" && check.key === "pack" && !matches,
      };
    });
    const differences = checks.filter((check) => !check.matches);
    const existingIds = new Set(mappingsFor(source.id, mappingType).map((mapping) => mapping.id));
    const sourcePips = new Set(source.pips.map((pip) => pip.pipCode).filter(Boolean));
    const duplicatePip = candidate.pips.find((pip) => sourcePips.has(pip.pipCode));
    const duplicate = existingIds.has(candidate.id) && candidate.id !== options.ignoreLinkedId;
    const criticalDifferences = differences.filter((check) => check.key !== "pack");
    const productFamilyMatches = Boolean(source.productFamilyId && candidate.productFamilyId)
      && normaliseText(source.productFamilyId) === normaliseText(candidate.productFamilyId);
    if (mappingType === "pack" && !productFamilyMatches) {
      criticalDifferences.push({ key: "productFamilyId", label: "Product Family / Clinical Identity" });
    }
    const packConversion = mappingType === "pack" ? packConversionDetails(source, candidate) : null;
    if (mappingType === "pi") {
      const validation = window.CascadeOptimisationValidation.validatePI(source, candidate);
      const currentIsPI = window.CascadeOptimisationValidation.isPI(source);
      const piProduct = currentIsPI ? source : candidate;
      const otherReference = !currentIsPI && mappingsFor(piProduct.id, "pi").some((mapping) => mapping.id !== source.id);
      const valid = !duplicate && !otherReference && !duplicatePip && validation.status === "Validated";
      const failedChecks = validation.checks.filter((check) => !check.matches);
      const statusLabels = { "Structured Data": "Missing Structured Data", Ingredient: "Ingredient Mismatch", Strength: "Strength Mismatch", "Dosage Form": "Form Mismatch", Route: "Route Mismatch", "Release Type": "Release Mismatch", "Formulation Modifier": "Formulation Mismatch", "Pack Size": "Pack Mismatch", "Comparable Pack Unit": "Pack Unit Mismatch", "Product Type": "Type Invalid", "Product Status": "Inactive PI" };
      const matchLabel = statusLabels[failedChecks[0]?.field] || "Invalid";
      return {
        checks: validation.checks.map((check) => ({ ...check, key: check.field, label: check.field,
          source: check.current, expectedDifference: check.result === "Expected" })),
        differences: validation.checks.filter((check) => !check.matches),
        label: duplicate ? "Already Linked" : otherReference ? "Linked to Another Reference" : duplicatePip ? "Duplicate PIP" : valid ? "Good Match" : matchLabel,
        mappingStatus: valid ? "Validated" : "Invalid", summaryTitle: valid ? "Valid PI Equivalent" : "Invalid PI Equivalent",
        severity: valid ? "good" : "error", duplicate, otherReference, packConversion: null, conversionMessage: "",
        message: otherReference ? "This PI product is linked to another UK reference. Change it from the PI product screen." : duplicate ? "This Product ID is already linked in the selected mapping type."
          : duplicatePip ? `PIP code ${duplicatePip.pipCode} already exists against the current Product ID.` : validation.message,
      };
    }
    let label = "Good Match";
    let mappingStatus = "Valid";
    let severity = "good";
    let message = "All required structured fields match the current product.";
    let summaryTitle = mappingStatus;
    let conversionMessage = "";

    if (duplicate) {
      label = "Already Linked";
      mappingStatus = "Invalid";
      summaryTitle = mappingStatus;
      severity = "error";
      message = "This Product ID is already linked in the selected mapping type.";
    } else if (duplicatePip) {
      label = "Invalid";
      mappingStatus = "Invalid";
      summaryTitle = mappingStatus;
      severity = "error";
      message = `PIP code ${duplicatePip.pipCode} already exists against the current Product ID.`;
    } else if (criticalDifferences.length) {
      const first = criticalDifferences[0];
      const labels = { ingredients: "Ingredient / Strength Differs", dosageForm: "Form Differs", route: "Route Differs", releaseType: "Release Differs", formulationModifier: "Formulation Differs", comparableUnit: "Comparable Unit Differs", productFamilyId: "Product Family Differs" };
      label = labels[first.key] || "Invalid";
      mappingStatus = "Invalid";
      summaryTitle = mappingStatus;
      severity = "error";
      message = `${criticalDifferences.map((check) => check.label).join(", ")} ${criticalDifferences.length === 1 ? "does" : "do"} not match. This product cannot be linked without correcting its structured data.`;
    } else if (differences.some((check) => check.key === "pack")) {
      if (mappingType === "pack") {
        mappingStatus = "Valid";
        summaryTitle = "Valid Pack Equivalent";
        label = packConversion?.exact
          ? "Exact conversion \u2713"
          : packConversion?.withinExcessTolerance
            ? `Round-up eligible \u2713 · ${compactQuantity(packConversion.excessPercentage)}% excess`
            : `Not eligible · ${compactQuantity(packConversion?.excessPercentage || 0)}% excess`;
        severity = packConversion?.exact || packConversion?.withinExcessTolerance ? "good" : "warning";
        message = "Core product attributes match. Pack size differs as expected.";
        conversionMessage = packConversion?.exact
          ? `Exact conversion: ${packConversion.equation}. Actual Pack Optimisation eligibility will be calculated using basket quantity, pricing and the ${OPTIMISATION_CONFIG.maximumExcessPercentage}% excess tolerance.`
          : `${packConversion?.withinExcessTolerance ? "Round-up eligible" : "Basket quantity review"}: ${packConversion?.equation || "structured comparable quantities are required"}. ${compactQuantity(packConversion?.excessUnits || 0)} extra ${String(source.secondaryUnit || source.packUnit || "units").toLowerCase()} (${compactQuantity(packConversion?.excessPercentage || 0)}% excess) for one current pack. Actual Pack Optimisation eligibility will be calculated using basket quantity, pricing and the ${OPTIMISATION_CONFIG.maximumExcessPercentage}% excess tolerance.`;
      } else {
        label = "Pack Differs";
        mappingStatus = "Needs Review";
        summaryTitle = mappingStatus;
        severity = "warning";
        message = "Pack size differs. Review and confirm the exception before linking this product.";
      }
    } else if (mappingType === "pack") {
      label = "Invalid";
      mappingStatus = "Invalid";
      summaryTitle = mappingStatus;
      severity = "error";
      message = "Pack Equivalent products must have different structured pack quantities.";
    }

    return { checks, differences, label, mappingStatus, summaryTitle, severity, message, conversionMessage, packConversion, duplicate };
  }

  function clearMappingCandidateSelection() {
    selectedCandidate = null;
    selectedValidation = null;
    elements.selectedProductDetails.hidden = true;
    elements.reviewAcknowledgement.checked = false;
    elements.reviewConfirmation.hidden = true;
    elements.confirmAddMapping.disabled = true;
  }

  function renderMappingResults(results, emptyMessage) {
    const source = selectedProduct();
    elements.mappingResultsBody.innerHTML = results.length
      ? results.map(({ candidate, validation }) => {
        const disabled = validation.duplicate || validation.otherReference || validation.message.includes("PIP code");
        const packSize = state.mappingTab === "pack"
          ? `${packLabel(source)} → ${packLabel(candidate)}`
          : packLabel(candidate);
        return `
          <tr data-candidate-id="${escapeHtml(candidate.id)}" class="${disabled ? "disabled-row" : ""}" aria-disabled="${String(disabled)}">
            <td><input type="radio" name="mappingCandidate" value="${escapeHtml(candidate.id)}" ${disabled ? "disabled" : ""} aria-label="Select ${escapeHtml(candidate.name)}" /></td>
            <td>${escapeHtml(candidate.id)}</td>
            <td title="${escapeHtml(candidate.name)}">${escapeHtml(candidate.name)}</td>
            <td>${escapeHtml(candidate.productType)}</td>
            <td>${escapeHtml(packSize)}</td>
            ${state.mappingTab === "pi" ? `<td>${candidate.inactive || (window.CascadeOptimisationValidation.isPI(candidate) && candidate.piStatus && normaliseText(candidate.piStatus) !== "active") ? "Inactive" : "Active"}</td>` : ""}
            <td><span class="status-badge ${state.mappingTab === "pi" ? (validation.mappingStatus === "Validated" ? "status-valid" : "status-invalid") : statusClass(validation.label)}">${escapeHtml(validation.label)}</span></td>
          </tr>`;
      }).join("")
      : `<tr><td class="empty-row" colspan="${state.mappingTab === "pi" ? 7 : 6}">${escapeHtml(emptyMessage)}</td></tr>`;
  }

  function mappingSuggestions(limit = 12) {
    const source = selectedProduct();
    const sourceIngredients = fieldComparable(source, "ingredients");
    if (!sourceIngredients) return [];
    const sourcePrimaryIngredient = normaliseText(source.ingredients[0]?.name);
    const suggestions = [];
    for (const base of catalogue) {
      if (base.id === source.id) continue;
      const update = state.updates[base.id] || {};
      let primaryIngredient = update.ingredients?.[0]?.name || base.cdStructured?.ingredients?.[0]?.name;
      if (!primaryIngredient && state.mappingTab !== "pi") {
        primaryIngredient = primaryIngredientById.get(base.id) || inferActiveIngredient(base.name);
        primaryIngredientById.set(base.id, primaryIngredient);
      }
      if (normaliseText(primaryIngredient) !== sourcePrimaryIngredient) continue;
      const candidate = getProduct(base.id);
      if (state.mappingTab === "pi" && (!source.structuredDataVerified || !candidate.structuredDataVerified)) continue;
      if (state.mappingTab !== "pi" && fieldComparable(candidate, "ingredients") !== sourceIngredients) continue;
      if (state.mappingTab === "pi" && window.CascadeOptimisationValidation.isPI(candidate) === window.CascadeOptimisationValidation.isPI(source)) continue;
      const validation = validateCandidate(source, candidate, state.mappingTab);
      if (state.mappingTab !== "pi" && validation.mappingStatus === "Invalid") continue;
      if (!["pack", "pi"].includes(state.mappingTab) && !["Valid", "Validated"].includes(validation.mappingStatus)) continue;
      let score = ["Valid", "Validated"].includes(validation.mappingStatus) ? 100 : 60;
      if (state.mappingTab === "brand" && candidate.productType !== source.productType) score += 30;
      if (state.mappingTab === "pi" && categoryCodes(candidate.category).includes("P")) score += 30;
      if (state.mappingTab === "pack" && fieldComparable(source, "pack") !== fieldComparable(candidate, "pack")) score += 30;
      if (state.mappingTab === "pack" && validation.packConversion?.exact) score += 20;
      else if (state.mappingTab === "pack" && validation.packConversion?.withinExcessTolerance) score += 10;
      suggestions.push({ candidate, validation, score });
      if (suggestions.length >= 60) break;
    }
    return suggestions
      .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name))
      .slice(0, limit);
  }

  function showMappingSuggestions() {
    clearMappingCandidateSelection();
    elements.mappingResultsTitle.textContent = "Suggested matches";
    elements.mappingResultsHint.textContent = "Products with matching ingredients and structured product information.";
    renderMappingResults(mappingSuggestions(), "No automatic suggestions are available. Use search to find additional products.");
  }

  function resetMappingDialog() {
    elements.mappingSearchInput.value = "";
    showMappingSuggestions();
  }

  function openMappingDialog() {
    mappingBeingReviewed = null;
    elements.confirmAddMapping.textContent = "Add Product";
    document.getElementById("piReferenceStatusHeader").hidden = state.mappingTab !== "pi";
    const config = MAPPING_CONFIG[state.mappingTab];
    resetMappingDialog();
    const piCurrent = state.mappingTab === "pi" && window.CascadeOptimisationValidation.isPI(selectedProduct());
    elements.mappingDialogTitle.textContent = piCurrent ? (mappingsFor(state.selectedId, "pi").length ? "Change UK Reference Product" : "Set UK Reference Product") : config.action;
    elements.mappingDialogHelp.textContent = state.mappingTab === "pi" ? (piCurrent ? "Search for an eligible non-PI UK reference product." : "Search and validate a PI alternative for this UK product.") : "Suggested matches are shown below. Search by product name, PIP code or Product ID for additional products.";
    elements.mappingDialog.showModal();
  }

  function mappingSearch() {
    const term = normaliseText(elements.mappingSearchInput.value);
    if (!term) {
      showMappingSuggestions();
      return;
    }
    clearMappingCandidateSelection();
    elements.mappingResultsTitle.textContent = "Search results";
    elements.mappingResultsHint.textContent = `Results matching “${elements.mappingSearchInput.value.trim()}”.`;
    if (term.length < 2) {
      elements.mappingResultsBody.innerHTML = '<tr><td class="empty-row" colspan="6">Enter at least two characters to search products.</td></tr>';
      return;
    }
    const source = selectedProduct();
    const results = [];
    for (const base of catalogue) {
      if (base.id === source.id || !productSearchText(base).includes(term)) continue;
      const candidate = getProduct(base.id);
      if (state.mappingTab === "pi" && window.CascadeOptimisationValidation.isPI(candidate) === window.CascadeOptimisationValidation.isPI(source)) continue;
      const validation = validateCandidate(source, candidate, state.mappingTab);
      results.push({ candidate, validation });
      if (results.length >= 40) break;
    }
    renderMappingResults(results, "No products match this search.");
  }

  function selectMappingCandidate(id) {
    const candidate = getProduct(id);
    if (!candidate) return;
    const validation = validateCandidate(selectedProduct(), candidate, state.mappingTab, { ignoreLinkedId: mappingBeingReviewed?.id });
    if (validation.duplicate || validation.otherReference || validation.message.includes("PIP code")) return;
    selectedCandidate = candidate;
    selectedValidation = validation;
    elements.mappingResultsBody.querySelectorAll("tr").forEach((row) => row.classList.toggle("selected", row.dataset.candidateId === id));
    const radio = elements.mappingResultsBody.querySelector(`input[value="${CSS.escape(id)}"]`);
    if (radio) radio.checked = true;
    elements.selectedProductDetails.hidden = false;
    elements.selectedProductSummary.innerHTML = `<strong>${escapeHtml(candidate.name)}</strong><span>Product ID: ${escapeHtml(candidate.id)}</span><span>PIP: ${escapeHtml(candidate.pips[0]?.pipCode || "-")}</span>`;
    const product = selectedProduct();
    const piDetailFields = new Set(["Ingredient", "Strength", "Dosage Form", "Route", "Release Type", "Formulation Modifier", "Pack Size", "Comparable Pack Unit", "Product Type", "Product Status"]);
    const comparisonChecks = state.mappingTab === "pi"
      ? validation.checks.filter((check) => piDetailFields.has(check.label)).map((check) => check.label === "Pack Size"
        ? { ...check, source: packLabel(product), candidate: packLabel(candidate) } : check)
      : validation.checks;
    elements.comparisonGrid.innerHTML = `
      <div class="comparison-header">Field</div><div class="comparison-header">Current Product</div><div class="comparison-header">${state.mappingTab === "pi" ? (window.CascadeOptimisationValidation.isPI(product) ? "Selected Reference" : "Selected PI") : "Selected Product"}</div><div class="comparison-header">Result</div>
      ${comparisonChecks.map((check) => `
        <div>${escapeHtml(check.label)}</div><div>${escapeHtml(check.source || "Not recorded")}</div><div>${escapeHtml(check.candidate || "Not recorded")}</div><div class="${check.expectedDifference ? "comparison-expected" : check.matches ? "comparison-match" : "comparison-difference"}">${escapeHtml(check.result || (check.expectedDifference ? "Expected difference" : check.matches ? "Match" : "Differs"))}</div>`).join("")}`;
    elements.validationMessage.className = `validation-message ${validation.severity === "good" ? "" : validation.severity}`.trim();
    elements.validationMessage.innerHTML = validation.conversionMessage
      ? `<strong>${escapeHtml(validation.summaryTitle)}</strong><span>${escapeHtml(validation.message)}</span><span>${escapeHtml(validation.conversionMessage)}</span>`
      : `<span><strong>${escapeHtml(validation.summaryTitle)}:</strong> ${escapeHtml(validation.message)}</span>`;
    if (state.mappingTab === "pi" && validation.mappingStatus === "Invalid" && !validation.duplicate && !validation.message.includes("PIP code")) {
      const failures = validation.checks.filter((check) => !check.matches);
      elements.validationMessage.innerHTML = `<strong>Invalid PI Equivalent</strong><span>${failures.map((check) => escapeHtml(check.failure)).join("; ")}</span>`;
    }
    elements.reviewConfirmation.hidden = validation.mappingStatus !== "Needs Review";
    elements.reviewAcknowledgement.checked = false;
    elements.confirmAddMapping.disabled = (validation.mappingStatus === "Invalid" && !mappingBeingReviewed) || validation.mappingStatus === "Needs Review";
    if (mappingBeingReviewed) elements.confirmAddMapping.textContent = validation.mappingStatus === "Invalid" ? "Mark Invalid" : "Revalidate Mapping";
  }

  async function addMapping(event) {
    event.preventDefault();
    if (!selectedCandidate || !selectedValidation) return;
    if (selectedValidation.mappingStatus === "Invalid" && !mappingBeingReviewed) {
      showToast("This product failed validation and cannot be linked.", "error");
      return;
    }
    if (selectedValidation.mappingStatus === "Needs Review" && !elements.reviewAcknowledgement.checked) {
      showToast("Confirm that you reviewed the differences before linking.", "error");
      return;
    }
    if (mappingBeingReviewed) {
      try {
        const result = mappingBeingReviewed.serverId ? await mappingApi(`/${mappingBeingReviewed.serverId}/review`, {
          method: "PUT", body: { sourceProduct: productForMappingApi(selectedProduct()), replacementProduct: productForMappingApi(selectedCandidate) },
        }) : null;
        if (result) await hydrateMappingsFromApi();
        else {
          if (selectedValidation.mappingStatus === "Invalid") { [state.selectedId, selectedCandidate.id].forEach((id) => mappingsFor(id, "pi").filter((item) => item.id === (id === state.selectedId ? selectedCandidate.id : state.selectedId)).forEach((item) => { item.status = "Invalid"; })); }
          else {
          [state.selectedId, selectedCandidate.id].forEach((id) => mappingsFor(id, "pi").filter((item) => item.id === (id === state.selectedId ? selectedCandidate.id : state.selectedId)).forEach((item) => { item.status = "Validated"; }));
          }
        }
        addAudit(state.selectedId, selectedValidation.mappingStatus === "Invalid" ? "PI mapping marked Invalid" : "PI mapping revalidated", `${state.selectedId} ? ${selectedCandidate.id} | ${selectedValidation.message}`);
        persistState();
        renderMapping();
        renderAudit();
        elements.mappingDialog.close();
        mappingBeingReviewed = null;
        showToast(selectedValidation.mappingStatus === "Invalid" ? "PI mapping marked Invalid." : "PI relationship validated.");
      } catch (error) { showToast(error.message, "error"); }
      return;
    }
    const target = mappingsFor(state.selectedId, state.mappingTab);
    if (target.some((mapping) => mapping.id === selectedCandidate.id)) {
      showToast("This Product ID is already linked.", "error");
      return;
    }
    const linkedProductName = selectedCandidate.name;
    let serverMapping = null;
    const requestBody = {
      sourceProduct: productForMappingApi(selectedProduct()),
      replacementProduct: productForMappingApi(selectedCandidate),
      mappingType: state.mappingTab,
      reviewAcknowledged: elements.reviewAcknowledgement.checked,
      changeReference: state.mappingTab === "pi" && window.CascadeOptimisationValidation.isPI(selectedProduct()) && target.length > 0,
    };
    try {
      serverMapping = await mappingApi("", {
        method: "POST",
        body: requestBody,
      });
    } catch (error) {
      if (error.code === "brand_group_merge_required" || error.code === "relationship_group_merge_required") {
        const approved = window.confirm(`${error.message}\n\nCombine the two approved equivalent groups? This decision will be recorded in Audit History.`);
        if (!approved) return;
        const mergeReason = window.prompt("Enter the reason for combining these Brand Equalisation groups:", "Approved equivalent products reviewed by an administrator.");
        if (!mergeReason?.trim()) {
          showToast("A reason is required before combining groups.", "error");
          return;
        }
        try {
          serverMapping = await mappingApi("", {
            method: "POST",
            body: { ...requestBody, mergeAuthorised: true, mergeReason: mergeReason.trim(), reviewAcknowledged: true },
          });
        } catch (mergeError) {
          showToast(mergeError.message, "error");
          return;
        }
      } else {
        showToast(error.message, "error");
        return;
      }
    }
    if (serverMapping) {
      await hydrateMappingsFromApi();
    } else if (state.mappingTab === "pi") {
      const sourceId = state.selectedId;
      const candidateId = selectedCandidate.id;
      if (window.CascadeOptimisationValidation.isPI(selectedProduct())) {
        for (const old of [...mappingsFor(sourceId, "pi")]) removeLocalMapping(sourceId, "pi", old.id);
      }
      const link = { status: "Validated", linkedOn: nowLabel(), createdBy: CURRENT_USER };
      mappingsFor(sourceId, "pi").push({ ...link, id: candidateId });
      mappingsFor(candidateId, "pi").push({ ...link, id: sourceId });
    } else if (["brand", "pack"].includes(state.mappingTab)) {
      const memberIds = new Set([state.selectedId, selectedCandidate.id, ...target.map((mapping) => mapping.id)]);
      memberIds.forEach((sourceId) => {
        const sourceMappings = mappingsFor(sourceId, state.mappingTab);
        state.mappings[sourceId][state.mappingTab] = [...memberIds]
          .filter((replacementId) => replacementId !== sourceId)
          .map((replacementId) => {
            const existing = sourceMappings.find((mapping) => mapping.id === replacementId);
            return existing || {
              id: replacementId,
              status: state.mappingTab === "pi" ? "Validated" : replacementId === selectedCandidate.id ? selectedValidation.mappingStatus : "Valid",
              linkedOn: nowLabel(),
              createdBy: CURRENT_USER,
            };
          });
      });
    } else {
      target.push({
        id: selectedCandidate.id,
        serverId: serverMapping?.id,
        status: serverMapping?.status || selectedValidation.mappingStatus,
        linkedOn: serverMapping?.linkedOn || nowLabel(),
        createdBy: serverMapping?.createdBy || CURRENT_USER,
      });
    }
    if (state.mappingTab !== "pi") state.updates[selectedCandidate.id] = {
      ...(state.updates[selectedCandidate.id] || {}),
      productFamilyId: selectedProduct().productFamilyId,
    };
    addAudit(state.selectedId, `${MAPPING_CONFIG[state.mappingTab].heading} mapping created`, `Linked Product ID ${selectedCandidate.id} as ${selectedValidation.mappingStatus}`);
    persistState();
    renderMapping();
    renderAudit();
    if (elements.mappingSearchInput.value.trim()) mappingSearch();
    else showMappingSuggestions();
    showToast(`${linkedProductName} linked successfully.`);
  }

  function removeLocalMapping(sourceId, mappingType, removedId) {
    if (mappingType === "pi") {
      state.mappings[sourceId][mappingType] = mappingsFor(sourceId, mappingType).filter((mapping) => mapping.id !== removedId);
      state.mappings[removedId][mappingType] = mappingsFor(removedId, mappingType).filter((mapping) => mapping.id !== sourceId);
      return;
    }
    const groupIds = new Set([sourceId, removedId, ...mappingsFor(sourceId, mappingType).map((mapping) => mapping.id)]);
    groupIds.forEach((groupProductId) => {
      if (groupProductId === removedId) {
        if (state.mappings[groupProductId]) state.mappings[groupProductId][mappingType] = [];
        return;
      }
      if (state.mappings[groupProductId]) {
        state.mappings[groupProductId][mappingType] = mappingsFor(groupProductId, mappingType).filter((mapping) => mapping.id !== removedId);
      }
    });
  }

  async function unlinkSelectedMappings() {
    const sourceId = state.selectedId;
    const mappingType = state.mappingTab;
    const selectedMappings = mappingsFor(sourceId, mappingType)
      .filter((mapping) => selectedMappingIds.has(mapping.id));
    if (!selectedMappings.length) return;
    const count = selectedMappings.length;
    const productLabel = count === 1 ? "product" : "products";
    if (!window.confirm(mappingType === "pi" ? (window.CascadeOptimisationValidation.isPI(selectedProduct()) ? "Remove UK Reference?" : "Unlink PI Equivalent?") : `Unlink ${count} selected ${productLabel} from ${MAPPING_CONFIG[mappingType].heading}? ${count === 1 ? "This change" : "These changes"} will be recorded in Audit History.`)) return;

    elements.unlinkMappingsButton.disabled = true;
    const removedMappings = [];
    try {
      for (const mapping of selectedMappings) {
        if (mapping.serverId) await mappingApi(`/${mapping.serverId}`, { method: "DELETE" });
        removedMappings.push(mapping);
      }
    } catch (error) {
      if (removedMappings.some((mapping) => mapping.serverId)) await hydrateMappingsFromApi();
      removedMappings.filter((mapping) => !mapping.serverId)
        .forEach((mapping) => removeLocalMapping(sourceId, mappingType, mapping.id));
      removedMappings.forEach((mapping) => addAudit(sourceId, `${MAPPING_CONFIG[mappingType].heading} mapping removed`, `Unlinked Product ID ${mapping.id}`));
      persistState();
      selectedMappingIds.clear();
      renderMapping();
      renderAudit();
      showToast(removedMappings.length ? `${removedMappings.length} ${removedMappings.length === 1 ? "mapping was" : "mappings were"} unlinked before the operation stopped. ${error.message}` : error.message, "error");
      return;
    }

    if (removedMappings.some((mapping) => mapping.serverId)) await hydrateMappingsFromApi();
    removedMappings.filter((mapping) => !mapping.serverId)
      .forEach((mapping) => removeLocalMapping(sourceId, mappingType, mapping.id));
    removedMappings.forEach((mapping) => addAudit(sourceId, `${MAPPING_CONFIG[mappingType].heading} mapping removed`, `Unlinked Product ID ${mapping.id}`));
    persistState();
    selectedMappingIds.clear();
    renderMapping();
    renderAudit();
    showToast(`${count} product ${count === 1 ? "mapping" : "mappings"} unlinked.`);
  }

  function allPipOwners() {
    const owners = new Map();
    catalogue.forEach((product) => {
      [...product.pips, ...(state.additionalPips[product.id] || [])].forEach((pip) => {
        if (pip.pipCode) owners.set(pip.pipCode, product.id);
      });
    });
    return owners;
  }

  function openPipDialog() {
    elements.pipDialogForm.reset();
    elements.pipProductId.value = state.selectedId;
    elements.pipFormError.textContent = "";
    elements.pipDialog.showModal();
    elements.pipCodeInput.focus();
  }

  function savePipCode(event) {
    event.preventDefault();
    const pipCode = elements.pipCodeInput.value.trim();
    const companyName = elements.pipCompanyName.value.trim();
    const owner = allPipOwners().get(pipCode);
    if (!/^\d{4,10}$/.test(pipCode)) {
      elements.pipFormError.textContent = "Enter a numeric PIP code containing 4 to 10 digits.";
      return;
    }
    if (!companyName) {
      elements.pipFormError.textContent = "Choose or enter a company name.";
      return;
    }
    if (owner) {
      elements.pipFormError.textContent = `PIP code ${pipCode} already exists against Product ID ${owner}.`;
      return;
    }
    state.additionalPips[state.selectedId] ||= [];
    state.additionalPips[state.selectedId].push({ pipCode, companyName, companyType: elements.pipCompanyType.value });
    addAudit(state.selectedId, "PIP code created", `Added ${pipCode} for ${companyName}`);
    persistState();
    elements.pipDialog.close();
    renderPipCodes();
    renderAudit();
    showToast("PIP code added.");
  }

  function openImportDialog() {
    elements.importDialogForm.reset();
    elements.importReview.hidden = true;
    elements.importReviewConfirmation.hidden = true;
    elements.confirmImport.disabled = true;
    document.querySelectorAll("[data-import-step]").forEach((step, index) => {
      step.classList.toggle("active", index === 0);
      step.classList.remove("complete");
    });
    elements.importDialog.showModal();
  }

  function validateImportFile() {
    const file = elements.pipImportFile.files[0];
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    const validType = ["xls", "xlsx", "csv"].includes(extension);
    document.querySelectorAll("[data-import-step]").forEach((step, index) => {
      step.classList.toggle("complete", index < 3);
      step.classList.toggle("active", index === 3);
    });
    elements.importReview.hidden = false;
    elements.importReviewConfirmation.hidden = false;
    elements.importReview.innerHTML = validType
      ? `<strong>Validation complete for ${escapeHtml(file.name)}.</strong><br />The file is staged for admin review. Duplicate Product IDs and PIP codes will be rejected; existing records will not be overwritten automatically.`
      : `<strong>Validation failed.</strong><br />${escapeHtml(file.name)} is not an accepted Excel or CSV file.`;
    elements.importReviewCheckbox.disabled = !validType;
  }

  function confirmImport(event) {
    event.preventDefault();
    if (!elements.pipImportFile.files[0] || !elements.importReviewCheckbox.checked) return;
    document.querySelectorAll("[data-import-step]").forEach((step) => {
      step.classList.add("complete");
      step.classList.remove("active");
    });
    document.querySelector('[data-import-step="confirm"]').classList.add("active");
    addAudit(state.selectedId, "PIP import confirmed", `Validated file ${elements.pipImportFile.files[0].name}; no immediate overwrite performed`);
    persistState();
    elements.importDialog.close();
    renderAudit();
    showToast("Import confirmed after validation and admin review.");
  }

  function openNewProductDialog() {
    elements.newProductForm.reset();
    elements.newProductError.textContent = "";
    selectedNewProductCategories = new Set();
    renderNewProductCategoryPicker();
    elements.newProductDialog.showModal();
    elements.newProductName.focus();
  }

  function renderNewProductCategoryPicker() {
    const selectedCodes = [...selectedNewProductCategories].sort();
    elements.newProductCategoryValue.textContent = selectedCodes.length
      ? categoryDisplay(selectedCodes.join(","))
      : "Select PMR categories";
    elements.newProductCategoryOptions.innerHTML = categoryChoices.map((code) => {
      const selected = selectedNewProductCategories.has(code);
      return `<button class="basic-category-option ${selected ? "selected" : ""}" type="button" role="option" aria-selected="${String(selected)}" data-new-product-category="${escapeHtml(code)}"><span>${escapeHtml(code)} - ${escapeHtml(categoryCodeLabel(code))}</span><span aria-hidden="true">${selected ? "&#10003;" : ""}</span></button>`;
    }).join("");
  }

  function closeNewProductCategoryMenu() {
    elements.newProductCategoryMenu.hidden = true;
    elements.newProductCategory.setAttribute("aria-expanded", "false");
  }

  function confirmCloseNewProduct() {
    if (!window.confirm("Close Add New Product? Any information entered will be lost.")) return;
    closeNewProductCategoryMenu();
    elements.newProductDialog.close();
  }

  function nextProductId() {
    const numericIds = [...catalogueById.keys()].filter((id) => /^\d+$/.test(id)).map(Number).filter(Number.isSafeInteger);
    let id = String(numericIds.reduce((maximum, value) => Math.max(maximum, value), 0) + 1);
    while (catalogueById.has(id)) id = String(Number(id) + 1);
    return id;
  }

  async function createProduct(event) {
    event.preventDefault();
    const id = nextProductId();
    const name = elements.newProductName.value.trim();
    const category = [...selectedNewProductCategories].sort().join(",");
    const structured = {
      name,
      ingredients: [],
      activeIngredient: "",
      strengthValue: "",
      strengthUnit: "",
      perValue: "",
      perUnit: "",
      dosageForm: "",
      dosageFormOther: "",
      route: "",
      releaseType: "",
      formulationModifier: "None",
      packQuantity: "",
      packSize: "",
      packUnit: "",
      secondaryQuantity: "",
      secondaryUnit: "",
      productType: "",
      category,
    };
    if (!name || !category) {
      elements.newProductError.textContent = "Enter a Product Name and select at least one PMR Category.";
      return;
    }
    try {
      await saveProductMasterApi(id, { ...structured, pipCode: "" });
    } catch (error) {
      elements.newProductError.textContent = error.message;
      return;
    }
    const product = { id, name, category, createdAt: new Date().toISOString(), pips: [] };
    state.newProducts.push(product);
    state.updates[id] = structured;
    catalogue.unshift(product);
    catalogueById.set(id, product);
    filteredCatalogue = catalogue;
    addAudit(id, "Product created", `Product ID ${id} generated automatically`);
    elements.newProductDialog.close();
    state.page = 1;
    selectProduct(id, { basicEdit: true });
    showToast(`Product ${id} created. Complete the remaining Basic Product Information.`);
  }

  function exportProducts() {
    const rows = [["Product Id", "Product Name", "Category", "PIP Codes"]];
    filteredCatalogue.forEach((base) => {
      const product = getProduct(base.id);
      rows.push([product.id, product.name, product.category, product.pips.map((pip) => pip.pipCode).filter(Boolean).join("; ")]);
    });
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `cascade-products-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${filteredCatalogue.length.toLocaleString("en-GB")} products exported.`);
  }

  function populateLookups() {
    const companies = new Set();
    const categories = new Set();
    const categoryCodeSet = new Set();
    catalogue.forEach((product) => {
      if (product.category) {
        categories.add(product.category);
        categoryCodes(product.category).forEach((code) => categoryCodeSet.add(code));
      }
      product.pips.forEach((pip) => { if (pip.companyName) companies.add(pip.companyName); });
    });
    categoryChoices = Object.keys(CATEGORY_LABELS).filter((code) => code.length === 1).sort();
    elements.manufacturerOptions.innerHTML = [...companies].sort().map((company) => `<option value="${escapeHtml(company)}"></option>`).join("");
    elements.categoryOptions.innerHTML = categoryChoices.map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(categoryCodeLabel(code))}</option>`).join("");
    elements.productSearchCategory.innerHTML = '<option value="">All categories</option>' + categoryChoices.map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(`${code} - ${categoryCodeLabel(code)}`)}</option>`).join("");
  }

  elements.menuButton.addEventListener("click", () => {
    elements.body.classList.toggle("nav-collapsed");
    elements.menuButton.setAttribute("aria-expanded", String(!elements.body.classList.contains("nav-collapsed")));
  });
  elements.productsBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-product-id]");
    if (!row) return;
    const editButton = event.target.closest("[data-edit-product]");
    selectProduct(row.dataset.productId, { basicEdit: Boolean(editButton) });
  });
  elements.openProductSearch.addEventListener("click", () => {
    const filters = state.searchFilters || {};
    elements.productSearchInput.value = filters.productName || "";
    elements.productSearchCategory.value = filters.category || "";
    elements.productSearchPip.value = filters.pipCode || "";
    elements.productSearchCreatedFrom.value = filters.createdFrom || "";
    elements.productSearchCreatedTo.value = filters.createdTo || "";
    elements.productSearchDialog.showModal();
    elements.productSearchInput.focus();
  });
  elements.productSearchForm.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    state.searchFilters = {
      productName: elements.productSearchInput.value.trim(),
      category: elements.productSearchCategory.value,
      pipCode: elements.productSearchPip.value.trim(),
      createdFrom: elements.productSearchCreatedFrom.value,
      createdTo: elements.productSearchCreatedTo.value,
    };
    state.filter = state.searchFilters.productName;
    state.page = 1;
    renderProducts();
    if (elements.productSearchDialog.open) elements.productSearchDialog.close();
  });
  elements.productSearchForm.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.matches("input, select")) return;
    event.preventDefault();
    const searchButton = elements.productSearchForm.querySelector('button[value="default"]');
    elements.productSearchForm.requestSubmit(searchButton);
  });
  elements.clearProductSearch.addEventListener("click", () => {
    elements.productSearchForm.reset();
    state.filter = "";
    state.searchFilters = { productName: "", category: "", pipCode: "", createdFrom: "", createdTo: "" };
    state.page = 1;
    renderProducts();
  });
  elements.refreshProducts.addEventListener("click", () => { renderProducts(); showToast("Products refreshed from the loaded catalogue."); });
  elements.firstPage.addEventListener("click", () => { state.page = 1; renderProducts(); });
  elements.previousPage.addEventListener("click", () => { state.page -= 1; renderProducts(); });
  elements.nextPage.addEventListener("click", () => { state.page += 1; renderProducts(); });
  elements.lastPage.addEventListener("click", () => { state.page = Math.ceil(filteredCatalogue.length / state.pageSize); renderProducts(); });
  elements.pageNumber.addEventListener("change", () => { state.page = Number(elements.pageNumber.value) || 1; renderProducts(); });
  elements.pageSize.addEventListener("change", () => { state.pageSize = Number(elements.pageSize.value); state.page = 1; persistState(); renderProducts(); });
  elements.editBasicProduct.addEventListener("click", beginBasicEdit);
  elements.cancelBasicProduct.addEventListener("click", () => { setBasicFields(selectedProduct()); setBasicEditMode(false); });
  elements.basicProductForm.addEventListener("submit", saveBasicProduct);
  elements.addIngredient.addEventListener("click", () => {
    const ingredients = collectIngredients();
    ingredients.push(ingredientRecord(""));
    renderIngredientRows(ingredients);
    elements.ingredientRows.lastElementChild?.querySelector(".ingredient-name")?.focus();
  });
  elements.ingredientRows.addEventListener("click", (event) => {
    const row = event.target.closest(".ingredient-row");
    if (!row) return;
    if (event.target.closest(".add-per-button")) {
      row.querySelector(".ingredient-per-fields").hidden = false;
      event.target.closest(".add-per-button").hidden = true;
      row.querySelector(".ingredient-per-value").focus();
    }
    if (event.target.closest(".remove-ingredient-button")) {
      const index = Number(row.dataset.ingredientIndex);
      const ingredients = collectIngredients().filter((_, itemIndex) => itemIndex !== index);
      renderIngredientRows(ingredients);
    }
  });
  ["dosageForm", "route", "releaseType", "formulationModifier", "secondaryQuantity", "secondaryUnit"].forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener("change", () => {
      if (fieldId === "dosageForm") {
        const packUnit = document.getElementById("packUnit");
        ensureSelectValue(packUnit, normaliseSolidPackUnit(document.getElementById("dosageForm").value, packUnit.value));
      }
      updateConditionalBasicFields();
    });
  });
  elements.category.addEventListener("click", () => {
    if (elements.category.disabled) return;
    const opening = elements.basicCategoryMenu.hidden;
    elements.basicCategoryMenu.hidden = !opening;
    elements.category.setAttribute("aria-expanded", String(opening));
  });
  elements.basicCategoryOptions.addEventListener("click", (event) => {
    const option = event.target.closest("[data-basic-product-category]");
    if (!option) return;
    const code = option.dataset.basicProductCategory;
    if (selectedBasicProductCategories.has(code)) selectedBasicProductCategories.delete(code);
    else selectedBasicProductCategories.add(code);
    elements.basicProductError.textContent = "";
    renderBasicProductCategoryPicker();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".basic-category-picker")) closeBasicCategoryMenu();
    if (!event.target.closest(".new-product-category-picker")) closeNewProductCategoryMenu();
  });
  document.querySelectorAll("[data-main-tab]").forEach((tab) => tab.addEventListener("click", () => { state.mainTab = tab.dataset.mainTab; renderTabs(); }));
  document.querySelectorAll("[data-mapping-tab]").forEach((tab) => tab.addEventListener("click", () => { state.mappingTab = tab.dataset.mappingTab; renderMapping(); renderTabs(); }));
  elements.addMappingButton.addEventListener("click", openMappingDialog);
  elements.mappingBody.addEventListener("click", (event) => {
    const id = event.target.closest("[data-review-pi]")?.dataset.reviewPi;
    if (!id) return;
    const mapping = mappingsFor(state.selectedId, "pi").find((item) => item.id === id);
    if (!mapping) return;
    openMappingDialog();
    mappingBeingReviewed = mapping;
    selectMappingCandidate(id);
  });
  elements.unlinkMappingsButton.addEventListener("click", unlinkSelectedMappings);
  elements.selectAllMappings.addEventListener("change", () => {
    selectedMappingIds.clear();
    if (elements.selectAllMappings.checked) {
      elements.mappingBody.querySelectorAll("[data-select-mapping]")
        .forEach((checkbox) => selectedMappingIds.add(checkbox.dataset.selectMapping));
    }
    updateMappingSelectionControls();
  });
  elements.mappingSearchButton.addEventListener("click", mappingSearch);
  elements.mappingSearchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); mappingSearch(); } });
  elements.mappingResultsBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-candidate-id]");
    if (row && row.getAttribute("aria-disabled") !== "true") selectMappingCandidate(row.dataset.candidateId);
  });
  elements.reviewAcknowledgement.addEventListener("change", () => {
    elements.confirmAddMapping.disabled = !elements.reviewAcknowledgement.checked;
  });
  elements.mappingDialogForm.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    addMapping(event);
  });
  elements.mappingBody.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-mapping]");
    if (!checkbox) return;
    if (checkbox.checked) selectedMappingIds.add(checkbox.dataset.selectMapping);
    else selectedMappingIds.delete(checkbox.dataset.selectMapping);
    updateMappingSelectionControls();
  });
  elements.newPipCode.addEventListener("click", openPipDialog);
  elements.pipDialogForm.addEventListener("submit", (event) => { if (event.submitter?.value !== "cancel") savePipCode(event); });
  elements.pipCodesBody.addEventListener("click", (event) => {
    if (event.target.closest("[data-edit-pip]")) {
      showToast("PIP code editing is protected. Add a replacement code or use the validated import flow.");
    }
  });
  elements.uploadPipExcel.addEventListener("click", openImportDialog);
  elements.pipImportFile.addEventListener("change", validateImportFile);
  elements.importReviewCheckbox.addEventListener("change", () => {
    elements.confirmImport.disabled = !elements.importReviewCheckbox.checked;
  });
  elements.importDialogForm.addEventListener("submit", (event) => { if (event.submitter?.value !== "cancel") confirmImport(event); });
  elements.newProductButton.addEventListener("click", openNewProductDialog);
  elements.newProductCategory.addEventListener("click", () => {
    const opening = elements.newProductCategoryMenu.hidden;
    elements.newProductCategoryMenu.hidden = !opening;
    elements.newProductCategory.setAttribute("aria-expanded", String(opening));
  });
  elements.newProductCategoryOptions.addEventListener("click", (event) => {
    const option = event.target.closest("[data-new-product-category]");
    if (!option) return;
    event.stopPropagation();
    const code = option.dataset.newProductCategory;
    if (selectedNewProductCategories.has(code)) selectedNewProductCategories.delete(code);
    else selectedNewProductCategories.add(code);
    renderNewProductCategoryPicker();
    elements.newProductError.textContent = "";
  });
  elements.closeNewProduct.addEventListener("click", confirmCloseNewProduct);
  elements.cancelNewProduct.addEventListener("click", confirmCloseNewProduct);
  elements.newProductDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    confirmCloseNewProduct();
  });
  elements.newProductForm.addEventListener("submit", createProduct);
  elements.exportProducts.addEventListener("click", exportProducts);

  if (!catalogue.length) {
    elements.productsBody.innerHTML = '<tr><td class="empty-row" colspan="4">ProductData could not be loaded.</td></tr>';
    showToast("ProductData could not be loaded.", "error");
    return;
  }

  try {
    await hydrateOptimisationCatalogueFromApi();
    await hydrateMappingsFromApi();
  } catch (error) {
    console.warn("Product Mapping API unavailable; using the local Admin seed.", error);
  }
  populateLookups();
  renderProducts();
  renderDetails();
}());
