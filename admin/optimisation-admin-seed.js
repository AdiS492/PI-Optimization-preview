// Order Pad optimisation products required by Product Mapping Admin when the
// prototype is opened directly from disk. When served, the Admin API refreshes
// these records from optimisation_product so the database remains authoritative.
(function initialiseOptimisationAdminSeed(global) {
  "use strict";

  function product({
    id, name, pip, type, ingredient, strengthValue, strengthUnit = "mg",
    dosageForm, route = "Oral", packQuantity, packUnit, productFamily,
  }) {
    return {
      id,
      name,
      category: type === "Brand" ? "B" : "G",
      createdAt: "2026-10-26T00:00:00.000Z",
      pips: [{ companyName: "Product Mapping", companyType: "Supplier", pipCode: pip }],
      ingredients: [{ name: ingredient, strengthValue, strengthUnit, perValue: "", perUnit: "" }],
      productType: type,
      dosageForm,
      route,
      releaseType: "Standard",
      formulationModifier: "None",
      packQuantity: String(packQuantity),
      packUnit,
      comparableQuantity: String(packQuantity),
      comparableUnit: packUnit,
      productFamilyId: productFamily,
    };
  }

  const products = [
    product({ id: "147768", name: "Bisacodyl 5mg tabs (60)", pip: "8152084", type: "Generic", ingredient: "Bisacodyl", strengthValue: "5", dosageForm: "Tablet", packQuantity: 60, packUnit: "Tablets", productFamily: "PF-BISACODYL-5-TAB" }),
    product({ id: "80872", name: "Dulcolax 5mg tabs (60)", pip: "3805793", type: "Brand", ingredient: "Bisacodyl", strengthValue: "5", dosageForm: "Tablet", packQuantity: 60, packUnit: "Tablets", productFamily: "PF-BISACODYL-5-TAB" }),
    product({ id: "900101", name: "Lansoprazole 30mg caps (28)", pip: "2345678", type: "Generic", ingredient: "Lansoprazole", strengthValue: "30", dosageForm: "Capsule", packQuantity: 28, packUnit: "Capsules", productFamily: "PF-LANSOPRAZOLE-30-CAP" }),
    product({ id: "900111", name: "Zoton 30mg caps (28)", pip: "3456789", type: "Brand", ingredient: "Lansoprazole", strengthValue: "30", dosageForm: "Capsule", packQuantity: 28, packUnit: "Capsules", productFamily: "PF-LANSOPRAZOLE-30-CAP" }),
    product({ id: "900102", name: "Salbutamol 100mcg inhaler", pip: "4573891", type: "Generic", ingredient: "Salbutamol", strengthValue: "100", strengthUnit: "microgram", dosageForm: "Inhaler", route: "Inhalation", packQuantity: 1, packUnit: "Inhaler", productFamily: "PF-SALBUTAMOL-100-INH" }),
    product({ id: "900112", name: "Ventolin 100mcg inhaler", pip: "5678912", type: "Brand", ingredient: "Salbutamol", strengthValue: "100", strengthUnit: "microgram", dosageForm: "Inhaler", route: "Inhalation", packQuantity: 1, packUnit: "Inhaler", productFamily: "PF-SALBUTAMOL-100-INH" }),
    product({ id: "900103", name: "Amlodipine 5mg tabs (28)", pip: "6789123", type: "Generic", ingredient: "Amlodipine", strengthValue: "5", dosageForm: "Tablet", packQuantity: 28, packUnit: "Tablets", productFamily: "PF-AMLODIPINE-5-TAB" }),
    product({ id: "900113", name: "Norvasc 5mg tabs (28)", pip: "7891234", type: "Brand", ingredient: "Amlodipine", strengthValue: "5", dosageForm: "Tablet", packQuantity: 28, packUnit: "Tablets", productFamily: "PF-AMLODIPINE-5-TAB" }),
    product({ id: "101067", name: "Nurofen 200mg caplets (16)", pip: "2633253", type: "Brand", ingredient: "Ibuprofen", strengthValue: "200", dosageForm: "Caplet", packQuantity: 16, packUnit: "Caplets", productFamily: "PF-IBUPROFEN-200-CAPLET" }),
    product({ id: "89728", name: "Ibuprofen 200mg caplets (16)", pip: "1093111", type: "Generic", ingredient: "Ibuprofen", strengthValue: "200", dosageForm: "Caplet", packQuantity: 16, packUnit: "Caplets", productFamily: "PF-IBUPROFEN-200-CAPLET" }),
    product({ id: "103758", name: "Panadol Advance 500mg tabs (16)", pip: "3406535", type: "Brand", ingredient: "Paracetamol", strengthValue: "500", dosageForm: "Tablet", packQuantity: 16, packUnit: "Tablets", productFamily: "PF-PARACETAMOL-500-TAB" }),
    product({ id: "104666", name: "Paracetamol 500mg tabs (16)", pip: "1130574", type: "Generic", ingredient: "Paracetamol", strengthValue: "500", dosageForm: "Tablet", packQuantity: 16, packUnit: "Tablets", productFamily: "PF-PARACETAMOL-500-TAB" }),
    product({ id: "PACK100", name: "Paracetamol 500mg tabs (100)", pip: "5000100", type: "Generic", ingredient: "Paracetamol", strengthValue: "500", dosageForm: "Tablet", packQuantity: 100, packUnit: "Tablets", productFamily: "PF-PARACETAMOL-500-TAB" }),
    product({ id: "PACK50", name: "Paracetamol 500mg tabs (50)", pip: "5000050", type: "Generic", ingredient: "Paracetamol", strengthValue: "500", dosageForm: "Tablet", packQuantity: 50, packUnit: "Tablets", productFamily: "PF-PARACETAMOL-500-TAB" }),
    product({ id: "p6", name: "Alfacalcidol 0.5mcg caps (30)", pip: "1098110", type: "Generic", ingredient: "Alfacalcidol", strengthValue: "0.5", strengthUnit: "microgram", dosageForm: "Capsule", packQuantity: 30, packUnit: "Capsules", productFamily: "PF-ALFACALCIDOL-05-CAP" }),
    product({ id: "PACK-ALFA-60", name: "Alfacalcidol 0.5mcg caps (60)", pip: "5100060", type: "Generic", ingredient: "Alfacalcidol", strengthValue: "0.5", strengthUnit: "microgram", dosageForm: "Capsule", packQuantity: 60, packUnit: "Capsules", productFamily: "PF-ALFACALCIDOL-05-CAP" }),
    product({ id: "p26", name: "Amoxicillin 500mg capsules (21)", pip: "0018399", type: "Generic", ingredient: "Amoxicillin", strengthValue: "500", dosageForm: "Capsule", packQuantity: 21, packUnit: "Capsules", productFamily: "PF-AMOXICILLIN-500-CAP" }),
    product({ id: "PACK-AMOX-16", name: "Amoxicillin 500mg capsules (16)", pip: "5100016", type: "Generic", ingredient: "Amoxicillin", strengthValue: "500", dosageForm: "Capsule", packQuantity: 16, packUnit: "Capsules", productFamily: "PF-AMOXICILLIN-500-CAP" }),
    product({ id: "PACK-CET-100", name: "Cetirizine 10mg tablets (100)", pip: "5100100", type: "Generic", ingredient: "Cetirizine", strengthValue: "10", dosageForm: "Tablet", packQuantity: 100, packUnit: "Tablets", productFamily: "PF-CETIRIZINE-10-TAB" }),
    product({ id: "PACK-CET-22", name: "Cetirizine 10mg tablets (22)", pip: "5100022", type: "Generic", ingredient: "Cetirizine", strengthValue: "10", dosageForm: "Tablet", packQuantity: 22, packUnit: "Tablets", productFamily: "PF-CETIRIZINE-10-TAB" }),
    product({ id: "PACK-VITD-3", name: "Colecalciferol 50,000unit capsules (3)", pip: "5200003", type: "Generic", ingredient: "Colecalciferol", strengthValue: "50000", strengthUnit: "unit", dosageForm: "Capsule", packQuantity: 3, packUnit: "Capsules", productFamily: "PF-COLECALCIFEROL-50000-CAP" }),
    product({ id: "PACK-VITD-10", name: "Colecalciferol 50,000unit capsules (10)", pip: "5200010", type: "Generic", ingredient: "Colecalciferol", strengthValue: "50000", strengthUnit: "unit", dosageForm: "Capsule", packQuantity: 10, packUnit: "Capsules", productFamily: "PF-COLECALCIFEROL-50000-CAP" }),
  ];

  const mappings = [
    ["brand", "147768", "80872"],
    ["brand", "900101", "900111"],
    ["brand", "900102", "900112"],
    ["brand", "900103", "900113"],
    ["brand", "101067", "89728"],
    ["brand", "103758", "104666"],
    ["pack", "PACK100", "PACK50"],
    ["pack", "p6", "PACK-ALFA-60"],
    ["pack", "p26", "PACK-AMOX-16"],
    ["pack", "PACK-CET-100", "PACK-CET-22"],
    ["pack", "PACK-VITD-3", "PACK-VITD-10"],
  ].map(([mappingType, sourceProductId, replacementProductId]) => ({
    mappingType,
    sourceProductId,
    replacementProductId,
    status: "Validated",
    linkedOn: "26 Oct 2026, 00:00",
    createdBy: "order-pad-seed@luxshtech.com",
  }));

  (global.CascadePIExample?.products || []).forEach((item) => products.push({
    ...item, category: item.productType === "PI" ? "P" : "B",
    pips: [{ companyName: "Demo", companyType: "Supplier", pipCode: item.pip }],
    productFamilyId: item.productFamily,
  }));
  if (global.CascadePIExample) mappings.push(global.CascadePIExample.mapping);
  global.CascadeOptimisationAdminSeed = { products, mappings };
})(window);
