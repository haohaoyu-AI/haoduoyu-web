import {owner} from '../../../../lib/test-store';
import {readStepwiseTextTest} from '../../../../lib/stepwise-text';
import {stepwisePublicError} from '../../../../lib/stepwise-text-errors';

export async function GET(request: Request) {
 const user = owner(request), headers = {'Cache-Control': 'private, no-store'};
 if (!user) return Response.json({error: '请使用本人 ChatGPT 账号登录'}, {status: 401, headers});
 try {return Response.json(await readStepwiseTextTest(user), {headers});}
 catch (error) {return Response.json({error: stepwisePublicError(error)}, {status: 503, headers});}
}
