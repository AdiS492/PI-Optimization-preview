// Structured PI validation shared by Admin, the batch service and offline Order Pad.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CascadeOptimisationValidation = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const text = (value) => String(value ?? "").trim();
  const canonical = (value) => text(value).toLowerCase().replace(/\s+/g, " ");
  const unit = (value) => canonical(value).replace(/s$/, "");
  const id = (product) => text(product.productId ?? product.id);
  const isPI = (product) => canonical(product.productType) === "pi"
    || product.isParallelImport === true || product.isParallelImport === 1;
  const ingredients = (product) => Array.isArray(product.ingredients) ? product.ingredients : [];
  const completeIngredients = (product) => ingredients(product).length > 0 && ingredients(product)
    .every((item) => text(item.name) && Number.isFinite(Number(item.strengthValue)) && Number(item.strengthValue) > 0
      && text(item.strengthUnit) && Boolean(text(item.perValue)) === Boolean(text(item.perUnit))
      && (!text(item.perValue) || (Number.isFinite(Number(item.perValue)) && Number(item.perValue) > 0)));
  const ingredientKey = (product) => ingredients(product).map((item) =>
    [item.name, item.strengthValue, item.strengthUnit, item.perValue, item.perUnit].map(canonical).join("|")
  ).sort().join(";");
  const ingredientLabel = (product) => ingredients(product).map((item) =>
    `${text(item.name)} ${text(item.strengthValue)}${text(item.strengthUnit)}${item.perValue || item.perUnit ? `/${item.perValue || 1}${text(item.perUnit)}` : ""}`
  ).join("; ");

  function validatePI(source, selected, now = new Date()) {
    const checks = [];
    const add = (field, current, candidate, matches, failure, result) => checks.push({
      field, current: text(current), candidate: text(candidate), matches: Boolean(matches), failure,
      result: matches ? result || "Match" : "Failed",
    });
    const complete = (product) => product.structuredDataVerified !== false && completeIngredients(product)
      && ["dosageForm", "route", "releaseType", "packQuantity", "packUnit"].every((key) => text(product[key]))
      && Number(product.packQuantity) > 0
      && Boolean(text(product.secondaryQuantity)) === Boolean(text(product.secondaryUnit))
      && (!text(product.secondaryQuantity) || (Number.isFinite(Number(product.secondaryQuantity)) && Number(product.secondaryQuantity) > 0));
    add("Structured Data", "", "", complete(source) && complete(selected),
      "Structured product data requires review before PI mapping can be validated.", "Verified");
    const names = (product) => ingredients(product).map((item) => canonical(item.name)).sort().join(";");
    const strengths = (product) => ingredients(product).map((item) => [item.name, item.strengthValue, item.strengthUnit, item.perValue, item.perUnit].map(canonical).join("|")).sort().join(";");
    add("Ingredient", ingredients(source).map((i) => i.name).join("; "), ingredients(selected).map((i) => i.name).join("; "),
      completeIngredients(source) && completeIngredients(selected) && names(source) === names(selected), "Ingredient mismatch or missing");
    add("Strength", ingredientLabel(source), ingredientLabel(selected),
      completeIngredients(source) && completeIngredients(selected) && strengths(source) === strengths(selected), "Strength mismatch or missing");
    for (const [key, label] of [["dosageForm", "Dosage Form"], ["route", "Route"], ["releaseType", "Release Type"]]) {
      add(label, source[key], selected[key], text(source[key]) && text(selected[key])
        && canonical(source[key]) === canonical(selected[key]), `${label} mismatch or missing`);
    }
    add("Formulation Modifier", source.formulationModifier || "None", selected.formulationModifier || "None",
      canonical(source.formulationModifier || "None") === canonical(selected.formulationModifier || "None"), "Formulation modifier mismatch");
    add("Pack Size", `${source.packQuantity || ""} ${source.packUnit || ""}`, `${selected.packQuantity || ""} ${selected.packUnit || ""}`,
      Number(source.packQuantity) > 0 && Number(source.packQuantity) === Number(selected.packQuantity)
      && unit(source.packUnit) && unit(source.packUnit) === unit(selected.packUnit)
      && text(source.secondaryQuantity) === text(selected.secondaryQuantity)
      && unit(source.secondaryUnit) === unit(selected.secondaryUnit), "Pack size mismatch");
    add("Comparable Pack Unit", source.comparableUnit, selected.comparableUnit,
      unit(source.comparableUnit) && unit(source.comparableUnit) === unit(selected.comparableUnit)
      && Number(source.comparableQuantity) > 0 && Number(source.comparableQuantity) === Number(selected.comparableQuantity),
      "Comparable pack quantity / unit mismatch");
    const onePI = Number(isPI(source)) + Number(isPI(selected)) === 1;
    const pi = isPI(source) ? source : selected;
    add("Product Type", source.productType, selected.productType,
      onePI && canonical(pi.productType) === "pi", "Select one UK reference product and one PI product", "Expected");
    const active = !source.inactive && !selected.inactive
      && (!text(pi.piStatus) || canonical(pi.piStatus) === "active");
    const status = (product) => product.inactive || (isPI(product) && text(product.piStatus) && canonical(product.piStatus) !== "active") ? "Inactive" : "Active";
    add("Product Status", status(source), status(selected), active, "Product is inactive", "Valid");
    const failed = checks.find((check) => !check.matches);
    return {
      status: failed ? "Invalid" : "Validated", checks,
      message: failed ? failed.failure : "The selected products meet the PI matching requirements.",
    };
  }
  return { isPI, validatePI };
});
