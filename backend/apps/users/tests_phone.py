from django.test import SimpleTestCase

from apps.users.phone import is_valid_uz_phone, normalize_phone, phone_lookup_variants


class PhoneNormalizeTests(SimpleTestCase):
    def test_normalize_plus_and_spaces(self):
        self.assertEqual(normalize_phone('+998 90 123-45-67'), '998901234567')

    def test_normalize_local_nine_digits(self):
        self.assertEqual(normalize_phone('901234567'), '998901234567')

    def test_normalize_trunk_00(self):
        self.assertEqual(normalize_phone('00998901234567'), '998901234567')

    def test_is_valid(self):
        self.assertTrue(is_valid_uz_phone('+998901234567'))
        self.assertFalse(is_valid_uz_phone('12345'))

    def test_lookup_variants_include_local(self):
        variants = phone_lookup_variants('+998901234567')
        self.assertIn('998901234567', variants)
        self.assertIn('+998901234567', variants)
        self.assertIn('901234567', variants)
