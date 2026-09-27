import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
config_path = root / "config.json"
planner_path = root / "scripts" / "planner.js"
index_path = root / "index.html"

config = json.loads(config_path.read_text())
config["reminders"] = [{
    "id": "greenhouse_fruit_collection",
    "name": "Collect greenhouse fruit",
    "start_year": 2,
    "start_season": "fall",
    "start_day": 22,
    "interval_days": 3,
    "location": "greenhouse",
    "note": "Collect every 3 days. Greenhouse fruit trees produce one fruit daily and hold up to 3 fruits."
}]
config["updated_at"] = "2026-09-27"
config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")

js = planner_path.read_text()
if "self.reminders = [];" not in js:
    js = re.sub(r'(\tself\.events = \{\};[^\n]*\n)', r'\1\tself.reminders = [];\t\t\t\t// Recurring planner reminders\n', js, count=1)
if "self.reminders = config.reminders || [];" not in js:
    js = js.replace(
        "\t\t\t\t// Create newplan template",
        "\t\t\t\t// Load recurring reminders from config.\n\t\t\t\tself.reminders = config.reminders || [];\n\t\t\t\t\n\t\t\t\t// Create newplan template",
        1
    )

reminder_fn = '''\t// Return recurring reminders for a date in the currently selected year.\n\t// A continuous day index keeps the cadence correct across seasons and years.\n\tfunction calendar_reminders(date){\n\t\tif (!self.cyear || !date) return [];\n\t\tvar results = [];\n\t\tvar season_order = ["spring", "summer", "fall", "winter"];\n\t\tvar current_global_day = (self.cyear.index * YEAR_DAYS) + date;\n\n\t\t$.each(self.reminders || [], function(i, reminder){\n\t\t\tvar season_index = season_order.indexOf(reminder.start_season);\n\t\t\tif (season_index < 0) return;\n\t\t\tvar start_year_index = Math.max(0, parseInt(reminder.start_year || 1) - 1);\n\t\t\tvar start_day = parseInt(reminder.start_day || 1);\n\t\t\tvar start_global_day = (start_year_index * YEAR_DAYS) + (season_index * SEASON_DAYS) + start_day;\n\t\t\tvar interval = Math.max(1, parseInt(reminder.interval_days || 1));\n\t\t\tif (current_global_day >= start_global_day && (current_global_day - start_global_day) % interval === 0){\n\t\t\t\tresults.push(reminder);\n\t\t\t}\n\t\t});\n\n\t\treturn results;\n\t}\n\n'''
if "function calendar_reminders(date)" not in js:
    js = js.replace("\tfunction calendar_totals_day(date){\n", reminder_fn + "\tfunction calendar_totals_day(date){\n", 1)
if "self.calendar_reminders = calendar_reminders;" not in js:
    js = js.replace("\tself.calendar_harvests = calendar_harvests;\n", "\tself.calendar_harvests = calendar_harvests;\n\tself.calendar_reminders = calendar_reminders;\n", 1)
planner_path.write_text(js)

html = index_path.read_text()
html = re.sub(r'scripts/planner\.js\?v=[^"\']+', 'scripts/planner.js?v=greenhouse-fruit-reminder-20260927', html, count=1)
if ".calendar-reminder .fa" not in html:
    html = html.replace(
        ".loc_inline{ opacity:0.7; font-size: 0.9em; }",
        ".loc_inline{ opacity:0.7; font-size: 0.9em; }\n.calendar-reminder .fa{ color:#f1b83b; font-size:15px; margin-right:3px; }\n.reminder-panel{ border-left:4px solid #f1b83b; }",
        1
    )
filled_old = "'filled': self.calendar_plans(date).length || self.calendar_harvests(date).length"
filled_new = filled_old + " || self.calendar_reminders(date).length"
if filled_new not in html:
    html = html.replace(filled_old, filled_new, 1)

if 'class="event calendar-reminder"' not in html:
    pattern = re.compile(r'(<div class="event" ng-repeat="ev in self\.events\[date\].*?<span>\{\{ev\.get_text\(\)\}\}</span>\s*</div>)', re.S)
    reminder_event = '''\n\t\t\t\t\t\t\t<div class="event calendar-reminder" ng-repeat="reminder in self.calendar_reminders(date)" title="{{reminder.note}}">\n\t\t\t\t\t\t\t\t<i class="fa fa-bell"></i>\n\t\t\t\t\t\t\t\t<span>{{reminder.name}}</span>\n\t\t\t\t\t\t\t</div>'''
    html, count = pattern.subn(r'\1' + reminder_event, html, count=1)
    if count != 1:
        raise RuntimeError("Could not insert calendar reminder")

if 'class="alert alert-warning reminder-panel"' not in html:
    modal_reminder = '''\t\t\t\t\t<div class="alert alert-warning reminder-panel" ng-show="self.calendar_reminders(self.cdate).length">\n\t\t\t\t\t\t<div ng-repeat="reminder in self.calendar_reminders(self.cdate)">\n\t\t\t\t\t\t\t<i class="fa fa-bell"></i> <b>{{reminder.name}}</b><br>\n\t\t\t\t\t\t\t<span>{{reminder.note}}</span>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n'''
    html, count = re.subn(r'(\t+<div class="plant_crop">)', modal_reminder + r'\1', html, count=1)
    if count != 1:
        raise RuntimeError("Could not insert modal reminder")
index_path.write_text(html)

# Requested cadence: Year 2 Fall 22, then Fall 25; not Fall 24.
YEAR_DAYS, SEASON_DAYS = 112, 28
start = YEAR_DAYS + 2 * SEASON_DAYS + 22
fall_22_y2 = YEAR_DAYS + 2 * SEASON_DAYS + 22
fall_25_y2 = YEAR_DAYS + 2 * SEASON_DAYS + 25
fall_24_y2 = YEAR_DAYS + 2 * SEASON_DAYS + 24
assert (fall_22_y2 - start) % 3 == 0
assert (fall_25_y2 - start) % 3 == 0
assert (fall_24_y2 - start) % 3 != 0
assert "self.reminders = config.reminders || [];" in js
assert "function calendar_reminders(date)" in js
assert "self.calendar_reminders = calendar_reminders;" in js
assert 'class="event calendar-reminder"' in html
assert 'class="alert alert-warning reminder-panel"' in html
