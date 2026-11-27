// Illustrative catalogue records for the existing Cascade demo, never licence verification data.
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.CascadePIExample = data;
})(typeof window === "object" ? window : globalThis, function () {
  const common = {
    ingredients: [{ name: "Atorvastatin", strengthValue: "20", strengthUnit: "mg", perValue: "", perUnit: "" }],
    dosageForm: "Tablet", route: "Oral", releaseType: "Standard", formulationModifier: "None",
    packSize: "28 Tablets", packQuantity: "28", packUnit: "Tablets",
    comparableQuantity: "28", comparableUnit: "Tablets", productFamily: "PF-ATORVASTATIN-20-TAB",
    tariff: 10, drugTariffPrice: 10, structuredDataVerified: true,
  };
  const products = [
    { ...common, id: "DEMO-UK-LIP20", name: "Lipitor 20mg tablets (28)", pip: "DEMO-UK-20", productType: "Brand",
      initialQuantity: 4, selectedSupplier: "aah", prices: { aah: 8.50, bs: 8.60 } },
    { ...common, id: "DEMO-PI-LIP20", name: "Lipitor 20mg tablets (28) PI", pip: "DEMO-PI-20", productType: "PI",
      isParallelImport: true, piStatus: "Active", mappingStatus: "Validated", ukReferenceProductId: "DEMO-UK-LIP20",
      plpiLicenceNumber: "DEMO ONLY", initialBasket: false, prices: { bs: 7.30, aah: 7.40 } },
  ];
  const mapping = { mappingType: "pi", sourceProductId: products[0].id, replacementProductId: products[1].id,
    status: "Validated", linkedOn: "28 Oct 2026", createdBy: "demo-fixture" };
  return { products, mapping };
});
