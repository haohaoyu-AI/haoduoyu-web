import {requireChatGPTUser} from '../../chatgpt-auth';
import EditorialRequest from '../../../components/editorial-request';

export const dynamic = 'force-dynamic';
export default async function EditorialRunPage() {
 const user = await requireChatGPTUser('/writing/editorial-run');
 return <EditorialRequest key={user.userId} ownerScope={user.userId} />;
}
