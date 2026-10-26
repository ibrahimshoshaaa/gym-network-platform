import '../l10n/language.dart';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../core/api.dart';
import '../core/ui.dart';

class BranchCoverScreen extends StatefulWidget {
 final ApiClient api;final String gymId,branchId,branchName;
 final Future<Uint8List?> Function()? pickCover;
 const BranchCoverScreen({super.key,required this.api,required this.gymId,required this.branchId,required this.branchName,this.pickCover});
 @override State<BranchCoverScreen> createState()=>_BranchCoverScreenState();
}
class _BranchCoverScreenState extends State<BranchCoverScreen>{
 Json? cover;bool loading=true,busy=false;Object? error;
 @override void initState(){super.initState();load();}
 Future<void> load()async{try{final r=await widget.api.request('gyms/${widget.gymId}/images');final found=rows(r).where((i)=>i['branchId']==widget.branchId&&i['purpose']=='COVER');if(mounted)setState((){cover=found.isEmpty?null:found.first;error=null;});}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>loading=false);}}
 Future<void> upload()async{if(busy)return;setState((){busy=true;error=null;});try{Uint8List? bytes;if(widget.pickCover!=null){bytes=await widget.pickCover!();}else{final file=await ImagePicker().pickImage(source:ImageSource.gallery,imageQuality:85,maxWidth:1600);bytes=await file?.readAsBytes();}if(bytes==null)return;if(bytes.length>4194304)throw Exception(appText('s434'));await widget.api.request('gyms/${widget.gymId}/images?purpose=COVER&branchId=${widget.branchId}',method:'POST',bytes:bytes,mime:'image/jpeg');await load();if(mounted&&error==null)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(appText('s435'))));}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 Future<void> remove()async{final current=cover;if(current==null||busy)return;final yes=await showDialog<bool>(context:context,builder:(c){ AppLanguage.watch(c); return AlertDialog(title:Text(appText('s436')),content:Text(appText('s437')),actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:Text(appText('s217'))),TextButton(onPressed:()=>Navigator.pop(c,true),child:Text(appText('s438')))]); });if(yes!=true||!mounted)return;setState(()=>busy=true);try{await widget.api.request('gyms/${widget.gymId}/images/${current['id']}/remove',method:'POST');await load();}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:appText('s439'),child:ListView(padding:const EdgeInsets.all(20),children:[Text(widget.branchName,style:const TextStyle(fontSize:23,fontWeight:FontWeight.w800)),const SizedBox(height:8),Text(appText('s440'),style:TextStyle(color:muted)),const SizedBox(height:20),if(loading)const LinearProgressIndicator(minHeight:2),ClipRRect(borderRadius:BorderRadius.circular(24),child:AspectRatio(aspectRatio:16/9,child:cover==null?const ColoredBox(color:Color(0xffe3ede8),child:Icon(Icons.add_photo_alternate_outlined,color:green,size:50)):Image.network('${cover!['publicUrl']}',fit:BoxFit.cover,errorBuilder:(_,_,_)=>const ColoredBox(color:Color(0xffe3ede8),child:Icon(Icons.broken_image_outlined,color:green))))),const SizedBox(height:20),ErrorNote(error,retry:load),ActionButton(cover==null?appText('s441'):appText('s442'),busy:busy,onPressed:loading||busy?null:upload,icon:Icons.add_photo_alternate_outlined),if(cover!=null)TextButton(onPressed:busy?null:remove,child:Text(appText('s438')))])); }
}
