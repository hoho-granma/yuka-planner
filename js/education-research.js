(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EducationResearch=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';let records=new Map();
 function load(data){records=new Map((Array.isArray(data?.items)?data.items:[]).filter(i=>/^J10:\d+$/.test(i.id)).map(i=>[i.id,i]));}
 return {get:id=>records.get(id)||null,load};
});
