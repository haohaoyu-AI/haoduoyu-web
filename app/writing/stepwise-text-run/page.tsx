import {requireChatGPTUser} from '../../chatgpt-auth';
import StepwiseTextRun from '../../../components/stepwise-text-run';

export const dynamic = 'force-dynamic';
export default async function StepwiseTextPage() {
 await requireChatGPTUser('/writing/stepwise-text-run');
 return <StepwiseTextRun />;
}
