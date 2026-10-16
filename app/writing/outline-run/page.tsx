import {requireChatGPTUser} from '../../chatgpt-auth';
import OutlineRun from '../../../components/outline-run';
export const dynamic='force-dynamic';
export default async function OutlineRunPage(){await requireChatGPTUser('/writing/outline-run');return <OutlineRun/>;}
