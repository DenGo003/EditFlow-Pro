import unittest
from backend import core
class BaselineRegression(unittest.TestCase):
 def test_padding_preserves_speech(self):
  self.assertEqual(core.keep_ranges(10,[(2,4)],.1,.2,30),[[0,66],[117,300]])
 def test_overlapping_silences_merge(self):
  self.assertEqual(core.keep_ranges(10,[(2,4),(3,5)],0,0,30),[[0,60],[150,300]])
 def test_more_than_200_segments(self):
  ranges=core.keep_ranges(500,[(i*2+1,i*2+1.5) for i in range(220)],0,0,30)
  self.assertEqual(len(ranges),221)
  self.assertTrue(all(a<b for a,b in ranges))
  self.assertTrue(all(ranges[i][1]<ranges[i+1][0] for i in range(len(ranges)-1)))
 def test_arabic_english_srt(self):
  text=core.srt([{'start':0,'end':1.5,'text':'أهلاً Manchester'},{'start':2,'end':3,'text':'تمام'}])
  self.assertEqual(core.validate_srt(text),text)
 def test_overlap_rejected(self):
  with self.assertRaises(ValueError):core.validate_srt(core.srt([{'start':0,'end':2,'text':'أ'},{'start':1,'end':3,'text':'ب'}]))
if __name__=='__main__':unittest.main()
