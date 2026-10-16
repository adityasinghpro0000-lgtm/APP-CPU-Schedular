(() => {
  const base='/api/v1';
  async function request(path, options={}) {
    const response=await fetch(base+path, options);
    if (!response.ok) { let detail='Request failed ('+response.status+')'; try { const body=await response.json(); detail=body.detail||detail; } catch (_) {} throw new Error(detail); }
    if (response.status===204) return null;
    return response.json();
  }
  const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  window.AppAPI={
    request,
    listProfiles:()=>request('/profiles/'),
    profilePhotoUrl:id=>base+'/profiles/'+encodeURIComponent(id)+'/photo',
    uploadProfilePhoto:(id,file)=>{const body=new FormData();body.set('file',file);return request('/profiles/'+encodeURIComponent(id)+'/photo',{method:'POST',body});},
    removeProfilePhoto:id=>request('/profiles/'+encodeURIComponent(id)+'/photo',{method:'DELETE'}),
    createProfile:(name,role='Project user')=>{const body=new FormData();body.set('name',name);body.set('role',role);return request('/profiles/',{method:'POST',body});},
    updateProfile:(id,data)=>request('/profiles/'+id,json('PUT',data)),
    activateProfile:id=>request('/profiles/'+id+'/activate',{method:'POST'}),
    deleteProfile:id=>request('/profiles/'+id,{method:'DELETE'}),
    listWorkspaces:profileId=>request('/workspaces/?profile_id='+encodeURIComponent(profileId)),
    getWorkspace:id=>request('/workspaces/'+encodeURIComponent(id)),
    createWorkspace:(profileId,name)=>request('/workspaces/?profile_id='+encodeURIComponent(profileId)+'&name='+encodeURIComponent(name),{method:'POST'}),
    updateWorkspace:(id,data)=>request('/workspaces/'+encodeURIComponent(id),json('PUT',data)),
    saveWorkspace:(id,state)=>request('/workspaces/'+encodeURIComponent(id)+'/save',json('POST',state)),
    listLogs:profileId=>request('/logs/?profile_id='+encodeURIComponent(profileId)+'&limit=200'),
    createLog:(message,profileId)=>request('/logs/',json('POST',{message:message,profile_id:profileId||null})),
    clearLogs:profileId=>request('/logs/'+(profileId?'?profile_id='+encodeURIComponent(profileId):''),{method:'DELETE'})
  };
})();
