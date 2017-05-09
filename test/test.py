import os
import subprocess
from typing import Optional

# Abolute path to the test directory
TEST_ROOT = os.path.dirname(os.path.realpath(__file__))
# Abolute path to the root of the project
PROJECT_ROOT = os.path.abspath(os.path.join(TEST_ROOT, ".."))
# Abolute path to the Rust `swf-parser` executable
SWF_PARSER_RS = os.path.abspath(os.path.join(PROJECT_ROOT, "swf-parser.rs", "target", "debug", "swf-parser"))
# Abolute path to the Typescript `swf-parser` main script
SWF_PARSER_TS = os.path.abspath(os.path.join(PROJECT_ROOT, "swf-parser.ts", "build", "main", "main", "main.js"))


def test_rust(swf_path: str, expected_json_path: str, actual_json_path: str):
    completed_process = subprocess.run(
        [SWF_PARSER_RS, swf_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )
    with open(actual_json_path, "w") as actual_json_file:
        actual_json_file.buffer.write(completed_process.stdout)
        # sys.stdout.buffer.write(completed_process.stdout)


def test_typescript(swf_path: str, expected_json_path: str, actual_json_path: str):
    completed_process = subprocess.run(
        ["node", SWF_PARSER_TS, swf_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )
    if completed_process.returncode != 0:
        print("Error")
    else:
        with open(actual_json_path, "w") as actual_json_file:
            actual_json_file.buffer.write(completed_process.stdout)
            # sys.stdout.buffer.write(completed_process.stdout)


class TestItem:
    def __init__(self, swf_path: str, expected_path: str, actual_rs_path: str, actual_ts_path: Optional[str]):
        self.swf_path = swf_path
        self.expected_path = expected_path
        self.actual_rs_path = actual_rs_path
        self.actual_ts_path = actual_ts_path

    def run(self):
        if self.actual_rs_path is not None:
            print(self.actual_rs_path)
            test_rust(self.swf_path, self.expected_path, self.actual_rs_path)
        if self.actual_ts_path is not None:
            print(self.actual_ts_path)
            test_typescript(self.swf_path, self.expected_path, self.actual_ts_path)


test_items = [
    TestItem(
        os.path.join(TEST_ROOT, "end-to-end", "blank", "blank.swf"),
        os.path.join(TEST_ROOT, "end-to-end", "blank", "blank.expected.json"),
        os.path.join(TEST_ROOT, "end-to-end", "blank", "blank.rs.actual.json"),
        os.path.join(TEST_ROOT, "end-to-end", "blank", "blank.ts.actual.json"),
    ),
    TestItem(
        os.path.join(TEST_ROOT, "end-to-end", "hre-flash8", "main.flash8.swf"),
        os.path.join(TEST_ROOT, "end-to-end", "hre-flash8", "main.flash8.expected.json"),
        os.path.join(TEST_ROOT, "end-to-end", "hre-flash8", "main.flash8.rs.actual.json"),
        os.path.join(TEST_ROOT, "end-to-end", "hre-flash8", "main.flash8.ts.actual.json"),
    ),
    TestItem(
        os.path.join(TEST_ROOT, "end-to-end", "shumway", "swfs", "movieclip", "empty-mc-scenes", "empty-mc-scenes.swf"),
        os.path.join(TEST_ROOT, "end-to-end", "shumway", "swfs", "movieclip", "empty-mc-scenes", "empty-mc-scenes.expected.json"),
        os.path.join(TEST_ROOT, "end-to-end", "shumway", "swfs", "movieclip", "empty-mc-scenes", "empty-mc-scenes.rs.actual.json"),
        None,
    )
]


def test_all():
    for test_item in test_items:
        test_item.run()


test_all()
