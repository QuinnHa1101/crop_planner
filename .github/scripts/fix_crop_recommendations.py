from pathlib import Path

path = Path("index.html")
html = path.read_text()

old_condition = '''ng-show="!self.calendar_plans(self.cdate).length && !self.has_regrowth_on_day(self.cdate) && self.best_fit_crops(self.cdate, 3).length"'''
new_condition = '''ng-show="self.best_fit_crops(self.cdate, 3).length"'''

if new_condition not in html:
    if old_condition not in html:
        raise SystemExit("Crop recommendation visibility condition not found")
    html = html.replace(old_condition, new_condition, 1)

old_comment = "<!-- Crop suggestions: shown on any day with no existing plans and at least one valid crop."
new_comment = "<!-- Crop suggestions: always shown when at least one valid crop fits the selected date."
if old_comment in html:
    html = html.replace(old_comment, new_comment, 1)

old_src = './scripts/planner.js?v=recommendfix-20260918'
new_src = './scripts/planner.js?v=alwaysrecommend-20260918'
if new_src not in html:
    if old_src not in html:
        raise SystemExit("Planner cache key anchor missing")
    html = html.replace(old_src, new_src, 1)

assert new_condition in html
assert old_condition not in html
assert "self.suggest_crop(crop, self.cdate)" in html
assert new_src in html

path.write_text(html)
print("Crop recommendations now ignore existing plans and regrow harvests.")
