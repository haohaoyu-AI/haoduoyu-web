import unittest
from article_hub.sourcing import candidate_target

class CandidateReserveTests(unittest.TestCase):
    def test_rounding_and_bounds(self):
        for planned, expected in [(0,0),(1,3),(5,7),(7,10),(8,12),(10,14),(15,20),(20,25),(30,35)]:
            with self.subTest(planned=planned):
                self.assertEqual(candidate_target(planned),expected)
