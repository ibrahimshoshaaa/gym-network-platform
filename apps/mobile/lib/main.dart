import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:file_selector/file_selector.dart';
import 'package:url_launcher/url_launcher.dart';
import 'navigation_policy.dart';

void main() { WidgetsFlutterBinding.ensureInitialized(); runApp(const GymNetworkApp()); }
class GymNetworkApp extends StatelessWidget {
  const GymNetworkApp({super.key});
  @override Widget build(BuildContext context) => MaterialApp(debugShowCheckedModeBanner:false,title:'Gym Network',theme:ThemeData(colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xff087c70)),useMaterial3:true),home:const PlatformScreen());
}
class PlatformScreen extends StatefulWidget {
  const PlatformScreen({super.key});
  @override State<PlatformScreen> createState()=>_PlatformScreenState();
}
class _PlatformScreenState extends State<PlatformScreen> {
  late final WebViewController controller;
  int progress=0;
  String? error;
  bool ready=false;
  @override void initState(){super.initState();unawaited(configure());}
  Future<void> configure() async {
    controller=WebViewController(onPermissionRequest:(request) async {
      final current=Uri.tryParse(await controller.currentUrl()??'');
      if(!isInternal(current)||!request.types.every((type)=>type==WebViewPermissionResourceType.camera)){await request.deny();return;}
      if(await Permission.camera.request().isGranted){await request.grant();}else{await request.deny();}
    });
    await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await controller.setBackgroundColor(Colors.white);
    await controller.setNavigationDelegate(NavigationDelegate(
      onProgress:(value){if(mounted)setState(()=>progress=value);},
      onPageStarted:(_){if(mounted)setState(()=>error=null);},
      onWebResourceError:(failure){if(failure.isForMainFrame==true&&mounted)setState(()=>error='تعذر الاتصال بالمنصة. راجع الإنترنت وحاول مرة أخرى.');},
      onNavigationRequest:(request) async {
        final uri=Uri.tryParse(request.url);
        if(isInternal(uri))return NavigationDecision.navigate;
        if(isExternalAllowed(uri))await launchUrl(uri!,mode:LaunchMode.externalApplication);
        return NavigationDecision.prevent;
      },
    ));
    if(controller.platform is AndroidWebViewController){
      final android=controller.platform as AndroidWebViewController;
      await android.setGeolocationPermissionsPromptCallbacks(onShowPrompt:(request) async {
        final allowed=isInternal(Uri.tryParse(request.origin)) && await Permission.locationWhenInUse.request().isGranted;
        return GeolocationPermissionsResponse(allow:allowed,retain:false);
      });
      await android.setOnShowFileSelector((params) async {
        if(!isInternal(Uri.tryParse(await controller.currentUrl()??'')))return <String>[];
        const group=XTypeGroup(label:'صور الإيصالات والفروع',extensions:['jpg','jpeg','png','webp'],mimeTypes:['image/jpeg','image/png','image/webp']);
        final file=await openFile(acceptedTypeGroups:[group]);
        return file==null?<String>[]:[Uri.file(file.path).toString()];
      });
    }
    if(!mounted)return;
    setState(()=>ready=true);
    await controller.loadRequest(Uri.parse(platformOrigin));
  }
  Future<void> back() async {
    if(ready&&await controller.canGoBack()){await controller.goBack();return;}
    if(!mounted)return;
    final exit=await showDialog<bool>(context:context,builder:(context)=>AlertDialog(title:const Text('إغلاق التطبيق؟',textDirection:TextDirection.rtl),actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('رجوع')),TextButton(onPressed:()=>Navigator.pop(context,true),child:const Text('إغلاق'))]));
    if(exit==true&&mounted)await SystemNavigator.pop();
  }
  @override Widget build(BuildContext context)=>PopScope(canPop:false,onPopInvokedWithResult:(didPop,result){if(!didPop)unawaited(back());},child:Scaffold(body:SafeArea(child:Column(children:[if(progress<100)LinearProgressIndicator(value:progress/100),Expanded(child:!ready?const Center(child:CircularProgressIndicator()):error!=null?Center(child:Padding(padding:const EdgeInsets.all(24),child:Column(mainAxisSize:MainAxisSize.min,children:[const Icon(Icons.wifi_off,size:44),const SizedBox(height:16),Text(error!,textAlign:TextAlign.center,textDirection:TextDirection.rtl),const SizedBox(height:16),FilledButton(onPressed:()=>controller.reload(),child:const Text('إعادة المحاولة'))]))):WebViewWidget(controller:controller))]))));
}
