// RFC 9110 13.1.2: If-None-Match uses weak comparison, not quoted-string escapes.
// Validate the complete list; commas inside opaque tags are not separators.
const entityTag='(?:W/)?\"[\\x21\\x23-\\x7e\\x80-\\xff]*\"';
const entityTagList=new RegExp('^[\\t ]*(?:'+entityTag+')?[\\t ]*(?:,[\\t ]*(?:'+entityTag+')?[\\t ]*)*$');
export function matchesIfNoneMatch(value,etag) {
  if(value===null) return false;
  const field=value.replace(/^[\t ]+|[\t ]+$/g,'');
  if(field==='*') return true;
  if(!entityTagList.test(field)) return false;
  return (field.match(/(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/g)||[])
    .some(candidate=>candidate.replace(/^W\//,'')===etag);
}
