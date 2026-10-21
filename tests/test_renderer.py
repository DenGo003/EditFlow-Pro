import importlib.util
from pathlib import Path
import tempfile
import unittest

PATH=Path(__file__).parents[1]/'uxp'/'renderer'/'caption-render.py'
spec=importlib.util.spec_from_file_location('caption_renderer',PATH)
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class TestCaptionRenderer(unittest.TestCase):
    def test_parse_and_group_arabic(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'arabic.srt'
            p.write_text('1\n00:00:00,000 --> 00:00:02,000\nمانشستر يونايتد محتاج قرار جريء\n\n2\n00:00:03,000 --> 00:00:04,000\nلكن ده غلط',encoding='utf-8-sig')
            cues=r.parse_srt(p)
            self.assertEqual(len(cues),2)
            parts=r.partition(cues,2)
            self.assertEqual(len(parts),5)
            self.assertEqual(parts[0][0],0)
            self.assertAlmostEqual(parts[-1][1],4)
            self.assertTrue(all(0<=s<e for s,e,_ in parts))
            self.assertTrue(all(len(text.split())<=2 for _,_,text in parts))
    def test_styles_ass_safe(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'test.ass'
            cues=[(0,1,'مانشستر {bad} يونايتد'),(1.5,2.5,'يا سلام')]
            r.make_ass(cues,{'size':28,'outline':'1','motion':'pop','textColor':'#ffffff','accent':'#ff475e'},640,360,p)
            body=p.read_text(encoding='utf-8-sig')
            self.assertIn('مانشستر bad ',body)
            self.assertIn('يونايتد',body)
            self.assertIn('\\1c&H',body)
            self.assertIn('\\fscx88',body)
            self.assertEqual(body.count('Dialogue:'),2)
    def test_bad_color_rejected(self):
        with self.assertRaises(ValueError):r.ass_color('not-a-color')

if __name__=='__main__':unittest.main()
