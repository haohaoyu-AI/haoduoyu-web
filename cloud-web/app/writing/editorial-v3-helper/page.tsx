import {requireChatGPTUser} from '../../chatgpt-auth';
import EditorialV3Helper from '../../../components/editorial-v3-helper';

export const dynamic = 'force-dynamic';
export default async function EditorialV3HelperPage() {
 const user = await requireChatGPTUser('/writing/editorial-v3-helper');
 return <EditorialV3Helper ownerScope={user.userId} />;
}
