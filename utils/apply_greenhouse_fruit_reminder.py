import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
config_path = root / "config.json"
planner_path = root / "scripts" / "planner.js"
index_path = root / "index.html"

config = json.loads(config_path.read_text())
config["reminders"] = [
    {
        "id": "greenhouse_fruit_collection",
        "name": "Collect greenhouse fruit",
        "start_year": 2,
        "start_season": "fall",
        "start_day": 22,
        "interval_days": 3,
        "location": "greenhouse",
        "note": "Collect every 3 days. Greenhouse fruit trees produce one fruit daily and hold up to 3 fruits."
    }
]
config["updated_at"] = "2026-09-27"
config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")

js = planner_path.read_text()
js = js.replace(
    '\tself.events = {};\t\t\t\t\t// Birthdays & festivals\n',
    '\tself.events = {};\t\t\t\t\t// Birthdays & festivals\n\tself.reminders = [];\t\t\t\t// Recurring planner reminders\n'
)
js = js.replace(
    '\t\t\t\t// Create newplan template\n',
    '\t\t\t\t// Load recurring reminders from config.\n\t\t\t\tself.reminders = config.reminders || [];\n\t\t\t\t\n\t\t\t\t// Create newplan template\n'
)
anchor = '\tfunction calendar_totals_day(date){\n'
reminder_fn = '''\t// Return recurring reminders for a date in the currently selected year.\n\t// Dates are converted to one continuous day index so a 3-day cadence\n\t// continues correctly across season and year boundaries.\n\tfunction calendar_reminders(date){\n\t\tif (!self.cyear || !date) return [];\n\t\tvar results = [];\n\t\tvar season_order = ["spring", "summer", "fall", "winter"];\n\t\tvar current_global_day = (self.cyear.index * YEAR_DAYS) + date;\n\n\t\t$.each(self.reminders || [], function(i, reminder){\n\t\t\tvar season_index = season_order.indexOf(reminder.start_season);\n\t\t\tif (season_index < 0) return;\n\t\t\tvar start_year_index = Math.max(0, parseInt(reminder.start_year || 1) - 1);\n\t\t\tvar start_day = parseInt(reminder.start_day || 1);\n\t\t\tvar start_global_day = (start_year_index * YEAR_DAYS) + (season_index * SEASON_DAYS) + start_day;\n\t\t\tvar interval = Math.max(1, parseInt(reminder.interval_days || 1));\n\t\t\tif (current_global_day >= start_global_day && (current_global_day - start_global_day) % interval === 0){\n\t\t\t\tresults.push(reminder);\n\t\t\t}\n\t\t});\n\n\t\treturn results;\n\t}\n\n'''
if anchor not in js:
    raise RuntimeError("calendar_totals_day anchor not found")
js = js.replace(anchor, reminder_fn + anchor, 1)
js = js.replace(
    '\tself.calendar_harvests = calendar_harvests;\n',
    '\tself.calendar_harvests = calendar_harvests;\n\tself.calendar_reminders = calendar_reminders;\n'
)
planner_path.write_text(js)

html = index_path.read_text()
html = html.replace('scripts/planner.js?v=gold-seed-costs-20260927', 'scripts/planner.js?v=greenhouse-fruit-reminder-20260927')
html = html.replace(
    ".loc_inline{ opacity:0.7; font-size: 0.9em; }\n",
    ".loc_inline{ opacity:0.7; font-size: 0.9em; }\n.calendar-reminder .fa{ color:#f1b83b; font-size:15px; margin-right:3px; }\n.reminder-panel{ border-left:4px solid #f1b83b; }\n"
)
old_day = '''ng-class="{'filled': self.calendar_plans(date).length || self.calendar_harvests(date).length, 'has-planting': self.calendar_plans(date).length > 0 && self.calendar_harvests(date).length == 0, 'has-harvest': self.calendar_plans(date).length == 0 && self.calendar_harvests(date).length > 0, 'has-both': self.calendar_plans(date).length > 0 && self.calendar_harvests(date).length > 0}"'''
new_day = '''ng-class="{'filled': self.calendar_plans(date).length || self.calendar_harvests(date).length || self.calendar_reminders(date).length, 'has-planting': self.calendar_plans(date).length > 0 && self.calendar_harvests(date).length == 0, 'has-harvest': self.calendar_plans(date).length == 0 && self.calendar_harvests(date).length > 0, 'has-both': self.calendar_plans(date).length > 0 && self.calendar_harvests(date).length > 0}"'''
if old_day not in html:
    raise RuntimeError("calendar day class anchor not found")
html = html.replace(old_day, new_day, 1)
event_end = '''\t\t\t\t\t\t\t<div class="event" ng-repeat="ev in self.events[date] | orderBy:['!festival','name']" ng-show="self.player.settings.show_events" title="{{ev.get_text()}}">\n\t\t\t\t\t\t\t\t<img ng-src="{{ev.get_image()}}">\n\t\t\t\t\t\t\t\t<span>{{ev.get_text()}}</span>\n\t\t\t\t\t\t\t</div>\n'''
reminder_event = event_end + '''\t\t\t\t\t\t\t<div class="event calendar-reminder" ng-repeat="reminder in self.calendar_reminders(date)" title="{{reminder.note}}">\n\t\t\t\t\t\t\t\t<i class="fa fa-bell"></i>\n\t\t\t\t\t\t\t\t<span>{{reminder.name}}</span>\n\t\t\t\t\t\t\t</div>\n'''
if event_end not in html:
    raise RuntimeError("calendar event anchor not found")
html = html.replace(event_end, reminder_event, 1)
modal_anchor = '''\t\t\t\t\t<div class="plant_crop">\n'''
modal_reminder = '''\t\t\t\t\t<div class="alert alert-warning reminder-panel" ng-show="self.calendar_reminders(self.cdate).length">\n\t\t\t\t\t\t<div ng-repeat="reminder in self.calendar_reminders(self.cdate)">\n\t\t\t\t\t\t\t<i class="fa fa-bell"></i> <b>{{reminder.name}}</b><br>\n\t\t\t\t\t\t\t<span>{{reminder.note}}</span>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\n'''
if modal_anchor not in html:
    raise RuntimeError("plant crop modal anchor not found")
html = html.replace(modal_anchor, modal_reminder + modal_anchor, 1)
index_path.write_text(html)

# Validate the requested cadence with the same global-day formula used by JS.
YEAR_DAYS = 112
SEASON_DAYS = 28
start = YEAR_DAYS + 2 * SEASON_DAYS + 22
fall_22_y2 = YEAR_DAYS + 2 * SEASON_DAYS + 22
fall_25_y2 = YEAR_DAYS + 2 * SEASON_DAYS + 25
fall_24_y2 = YEAR_DAYS + 2 * SEASON_DAYS + 24
assert (fall_22_y2 - start) % 3 == 0
assert (fall_25_y2 - start) % 3 == 0
assert (fall_24_y2 - start) % 3 != 0
assert "calendar_reminders" in js
assert "Collect greenhouse fruit" in html
