from pathlib import Path

HELPER = '''\
\t// Return totals for the selected season and active location view.\n\tfunction calendar_totals_season(season_index){\n\t\tvar fin = new Finance;\n\t\tif (!self.cyear) return fin;\n\n\t\tfunction add_total(total){\n\t\t\tif (!total) return;\n\t\t\tfin.profit.min += total.profit.min;\n\t\t\tfin.profit.max += total.profit.max;\n\t\t\tfin.plantings += total.plantings;\n\t\t\tfin.harvests.min += total.harvests.min;\n\t\t\tfin.harvests.max += total.harvests.max;\n\t\t}\n\n\t\tvar farm = self.cyear.data.farm;\n\t\tvar indoor = self.cyear.data.greenhouse;\n\t\tif (self.cview === "all"){\n\t\t\tadd_total(farm.totals.season[season_index]);\n\t\t\tadd_total(indoor.totals.season[season_index]);\n\t\t\treturn fin;\n\t\t}\n\t\tif (self.cview === "farm"){\n\t\t\tadd_total(farm.totals.season[season_index]);\n\t\t\treturn fin;\n\t\t}\n\n\t\t// Greenhouse and Ginger Island share one data bucket, so calculate\n\t\t// these filtered views from each plan's saved location.\n\t\tvar start = (season_index * SEASON_DAYS) + 1;\n\t\tvar end = start + SEASON_DAYS - 1;\n\t\tfor (var date = start; date <= end; date++){\n\t\t\t$.each(indoor.plans[date] || [], function(i, plan){\n\t\t\t\tif ((plan.location || "greenhouse") !== self.cview) return;\n\t\t\t\tvar cost = plan.get_cost();\n\t\t\t\tfin.profit.min -= cost;\n\t\t\t\tfin.profit.max -= cost;\n\t\t\t\tfin.plantings += plan.amount;\n\t\t\t});\n\t\t\t$.each(indoor.harvests[date] || [], function(i, harvest){\n\t\t\t\tvar location = harvest.plan && harvest.plan.location || "greenhouse";\n\t\t\t\tif (location !== self.cview) return;\n\t\t\t\tfin.profit.min += harvest.revenue.min;\n\t\t\t\tfin.profit.max += harvest.revenue.max;\n\t\t\t\tfin.harvests.min += harvest.yield.min;\n\t\t\t\tfin.harvests.max += harvest.yield.max;\n\t\t\t});\n\t\t}\n\t\treturn fin;\n\t}\n\n'''

EXPOSURE_ANCHOR = "\tself.calendar_plans = calendar_plans;\n"
ANNUAL_OLD = '''// Add up annual total
\t\tfor (var i = 0; i < farm.totals.seasons; i++){
\t\t\tvar season = farm.totals.seasons[i];
\t\t\tvar y_total = farm.totals.year;
\t\t\ty_total.profit.min += season.profit.min
\t\t\ty_total.profit.max += season.profit.max
\t\t}'''
ANNUAL_NEW = '''// Add up annual total
\t\tfor (var i = 0; i < farm.totals.season.length; i++){
\t\t\tvar season = farm.totals.season[i];
\t\t\tvar y_total = farm.totals.year;
\t\t\ty_total.profit.min += season.profit.min;
\t\t\ty_total.profit.max += season.profit.max;
\t\t}'''

for filename in ("scripts/planner.js", "planner.js"):
    path = Path(filename)
    text = path.read_text()
    if "function calendar_totals_season(" not in text:
        if EXPOSURE_ANCHOR not in text:
            raise SystemExit(f"Missing calendar helper anchor in {filename}")
        text = text.replace(EXPOSURE_ANCHOR, HELPER + EXPOSURE_ANCHOR, 1)
    if "self.calendar_totals_season = calendar_totals_season;" not in text:
        exposure = "\tself.calendar_totals_day = calendar_totals_day;"
        if exposure not in text:
            raise SystemExit(f"Missing total exposure anchor in {filename}")
        text = text.replace(
            exposure,
            exposure + "\n\tself.calendar_totals_season = calendar_totals_season;",
            1,
        )
    if ANNUAL_OLD in text:
        text = text.replace(ANNUAL_OLD, ANNUAL_NEW, 1)
    elif "farm.totals.seasons" in text:
        raise SystemExit(f"Unexpected annual total block in {filename}")
    path.write_text(text)

index = Path("index.html")
html = index.read_text()
current_old = "self.cfarm().totals.season[self.cseason.index]"
card_old = "self.cfarm().totals.season[season.index]"
if current_old not in html or card_old not in html:
    raise SystemExit("Expected season total bindings were not found")
html = html.replace(current_old, "self.calendar_totals_season(self.cseason.index)")
html = html.replace(card_old, "self.calendar_totals_season(season.index)")
index.write_text(html)

assert "farm.totals.seasons" not in Path("scripts/planner.js").read_text()
assert "self.cfarm().totals.season" not in index.read_text()
print("All-farm profit patch applied successfully.")
