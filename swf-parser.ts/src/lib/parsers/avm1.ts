import * as avm1 from "../ast/avm1/index";
import {Stream} from "../stream";

/*
 pub fn parse_actions_string(input: &[u8]) -> IResult<&[u8], Vec<ast::Action>> {
 let mut block: Vec<ast::Action> = Vec::new();
 let mut current_input = input;

 if current_input.len() == 0 {
 return IResult::Incomplete(Needed::Size(1));
 }

 while current_input[0] != 0 {
 match parse_action(current_input) {
 IResult::Error(e) => return IResult::Error(e),
 IResult::Incomplete(Needed::Unknown) => return IResult::Incomplete(Needed::Unknown),
 IResult::Incomplete(Needed::Size(i)) => return IResult::Incomplete(Needed::Size(i)),
 IResult::Done(remaining_input, action) => {
 block.push(action);
 current_input = remaining_input;
 },
 }
 if current_input.len() == 0 {
 return IResult::Incomplete(Needed::Unknown);
 }
 }

 IResult::Done(current_input, block)
 }

 */


export function parseActionsString(byteStream: Stream): avm1.Action[] {
  return [];
}
