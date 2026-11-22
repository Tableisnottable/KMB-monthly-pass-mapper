import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('alignments', Path(__file__).with_name('import-alignments.py'))
alignments = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alignments)


def response(body, length=None):
    result = io.BytesIO(body)
    result.headers = {'Content-Type': 'application/octet-stream', 'Content-Length': str(length if length is not None else len(body))}
    return result


class DownloadTests(unittest.TestCase):
    def test_retries_incomplete_download_before_publishing(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'source.pbf'
            with patch.object(alignments.urllib.request, 'urlopen', side_effect=[response(b'bad', 100), response(b'complete')]), patch.object(alignments.time, 'sleep'):
                alignments.download('https://example.test/data', target)
            self.assertEqual(target.read_bytes(), b'complete')
            self.assertFalse(target.with_name('source.pbf.part').exists())

    def test_keeps_previous_file_after_bounded_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'source.pbf'
            target.write_bytes(b'previous')
            with patch.object(alignments.urllib.request, 'urlopen', side_effect=OSError('offline')) as fetch, patch.object(alignments.time, 'sleep'):
                with self.assertRaises(OSError):
                    alignments.download('https://example.test/data', target)
            self.assertEqual(fetch.call_count, 3)
            self.assertEqual(target.read_bytes(), b'previous')
            self.assertFalse(target.with_name('source.pbf.part').exists())


if __name__ == '__main__':
    unittest.main()
