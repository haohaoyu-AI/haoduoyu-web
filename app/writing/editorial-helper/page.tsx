import {requireChatGPTUser} from '../../chatgpt-auth';
import {effectiveWritingStyleVersion} from '../../../lib/writing-supplement';
import EditorialRun from '../../../components/editorial-run';

export const dynamic = 'force-dynamic';
export default async function EditorialHelperPage() {
 const user = await requireChatGPTUser('/writing/editorial-helper');
 return <EditorialRun promptVersion={effectiveWritingStyleVersion} ownerScope={user.userId} />;
}
