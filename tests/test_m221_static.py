import json,re,unittest
from html.parser import HTMLParser
from pathlib import Path
root=Path(__file__).resolve().parents[1]
class NodeCollector(HTMLParser):
 def __init__(self):super().__init__();self.cards=[];self.options=[];self.inpicker=False;self.words=[];self.ids=set();self.preset_index=[]
 def handle_starttag(self,name,attrs):
  d=dict(attrs)
  if 'id' in d:self.ids.add(d['id'])
  if d.get('id')=='studioPresetPicker':self.inpicker=True
  if name=='button' and 'data-preset-index' in d:self.cards.append(d)
  if name=='option' and self.inpicker:self.options.append(d)
  if re.fullmatch(r'studioWord[0-3]',d.get('id','')):self.words.append(d)
 def handle_endtag(self,name):
  if name=='select':self.inpicker=False
class HtmlTest(unittest.TestCase):
 def test_presets_and_preview_static(self):
  p=NodeCollector();p.feed((root/'uxp/index.html').read_text())
  self.assertEqual(len(p.cards),24)
  self.assertEqual(len(p.options),24)
  self.assertEqual(len(p.words),4)
  self.assertTrue({'studioReplay','studioReplayState','studioGallery','studioChooseSrt'}.issubset(p.ids))
 def test_fs_api(self):
  js=(root/'uxp/src/caption-apply.js').read_text()
  self.assertIn('getFileForOpening',js)
  self.assertNotIn('fs.getFile()',js)
 def test_gallery_has_filter_hiding(self):
  js=(root/'uxp/src/workspace.js').read_text()
  css=(root/'uxp/styles.css').read_text()
  self.assertIn("classList.add('filtered-out')",js)
  self.assertIn('.studio-preset-card.filtered-out{display:none!important;}',css)
if __name__=='__main__':unittest.main()
