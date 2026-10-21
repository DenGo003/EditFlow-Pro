from pathlib import Path
from html.parser import HTMLParser
root=Path(__file__).resolve().parents[1]
class StudioParser(HTMLParser):
 def __init__(self):
  super().__init__();self.inside=False;self.found=False;self.ids=[];self.classes=set();self.cards=0
 def handle_starttag(self,tag,attributes):
  a=dict(attributes)
  if tag=='section' and a.get('data-section')=='studio':self.inside=True;self.found=True
  if self.inside:
   if 'id' in a:self.ids.append(a['id'])
   self.classes.update(a.get('class','').split())
   if 'data-preset-index' in a:self.cards+=1
 def handle_endtag(self,tag):
  if tag=='section' and self.inside:self.inside=False
studio=StudioParser();studio.feed((root/'uxp/index.html').read_text(encoding='utf-8'))
assert studio.found
assert {'studio-monitor','studio-controls-scroll','studio-preview'}<=studio.classes
assert {'studioReplay','studioReplayState','studioSample','studioGallery','studioApplyOverlay'}<=set(studio.ids)
assert studio.cards==24
assert studio.ids.count('studioReplay')==1
css=(root/'uxp/styles.css').read_text(encoding='utf-8')
assert 'main.studio-mode' in css and 'overflow-y:auto' in css
js=(root/'uxp/src/workspace.js').read_text(encoding='utf-8')
assert "classList.toggle('studio-mode'" in js
assert 'setTimeout(tick,90)' in js
print('PASS M2.3: pinned preview + replay, independently scrollable controls, 24 presets, deferred animation')
