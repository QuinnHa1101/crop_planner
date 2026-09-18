from pathlib import Path

path = Path("index.html")
html = path.read_text()

comment = "\t\t\t\t\t<!-- Crop suggestions: shown on any day with no existing plans and at least one valid crop."
next_section = '\n\n\t\t\t\t\t<div ng-show="self.calendar_plans(self.cdate).length">'
plant_form = '\t\t\t\t\t<div class="plant_crop">'

if html.count(comment) != 1:
    raise SystemExit("Expected exactly one crop recommendation block")

start = html.index(comment)
end = html.index(next_section, start)
block = html[start:end]

# The seed-source controls made the modal taller and pushed recommendations
# below the visible area. Put recommendations first so every empty day shows
# them immediately when the modal opens.
html = html[:start] + html[end:]
insert_at = html.index(plant_form)
html = html[:insert_at] + block + "\n\n" + html[insert_at:]

old_src = './scripts/planner.js?v=seedsource-20260911'
new_src = './scripts/planner.js?v=recommendfix-20260918'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Planner cache key anchor missing")
    html = html.replace(old_src, new_src, 1)

# Regression checks: recommendation logic is present, unique, and appears
# before the expanded planting/seed-cost form.
assert html.count(comment) == 1
assert html.index(comment) < html.index(plant_form)
assert "self.best_fit_crops(self.cdate, 3).length" in block
assert "self.suggest_crop(crop, self.cdate)" in block
assert new_src in html

path.write_text(html)
print("Crop recommendations moved to the top of the day modal.")
