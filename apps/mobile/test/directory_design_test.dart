import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/l10n/language.dart';
import 'package:gym_network/screens/directory.dart';
import 'package:gym_network/screens/bookings.dart';
import 'operations_test.dart' show client,reply;

final gym=<String,dynamic>{'id':'b1','name':'فرع أشمون','gym':{'name':'جيم تجربة','description':'تفاصيل الجيم الحقيقية'},'governorate':'المنوفية','city':'أشمون','address':'عنوان الفرع الحقيقي','latitude':30.4,'longitude':31.1,'visitPricePoints':25,'sessionMinutes':90,'pricingVersion':1,'ratingAverage':4.8,'ratingCount':12,'openingHours':'من ٨ صباحًا إلى ١٢ مساءً','images':<dynamic>[]};
Widget host(Widget child,{String language='ar',double scale=1,String? fontFamily})=>LanguageScope(language:AppLanguage.instance,child:MaterialApp(theme:fontFamily==null?appTheme():appTheme().copyWith(textTheme:appTheme().textTheme.apply(fontFamily:fontFamily)),locale:Locale(language),supportedLocales:const[Locale('ar'),Locale('en')],localizationsDelegates:GlobalMaterialLocalizations.delegates,home:MediaQuery(data:MediaQueryData(textScaler:TextScaler.linear(scale)),child:Scaffold(body:child))));
Future<void> capture(WidgetTester t,Key key,String name)async{
 await t.runAsync(()async{
  final boundary=t.renderObject<RenderRepaintBoundary>(find.byKey(key));
  final picture=await boundary.toImage(pixelRatio:1);
  final bytes=await picture.toByteData(format:ui.ImageByteFormat.png);
  final directory=Directory('build/verification');await directory.create(recursive:true);
  await File('${directory.path}/$name.png').writeAsBytes(bytes!.buffer.asUint8List());picture.dispose();
 });
}
void main(){
 String? reviewFont;
 setUpAll(()async{
  final file=File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  if(await file.exists()){
   final loader=FontLoader('GymReviewSans')..addFont(Future.value(ByteData.sublistView(await file.readAsBytes())));
   await loader.load();reviewFont='GymReviewSans';
  }
 });
 test('gallery prefers covers and real photos, filters unsafe URLs, and retains a logo fallback',(){
  expect(gymGallery({'images':[{'url':'https://test.invalid/logo','purpose':'LOGO'},{'url':'http://test.invalid/no','purpose':'COVER'},{'url':'https://test.invalid/photo','purpose':'PHOTO'},{'url':'https://test.invalid/cover','purpose':'COVER'},{'url':'https://test.invalid/photo','purpose':'PHOTO'}]}).map((p)=>p['url']),['https://test.invalid/cover','https://test.invalid/photo']);
  expect(gymGallery({'images':[{'url':'https://test.invalid/logo','purpose':'LOGO'}]}).length,1);
  expect(gymGallery({'images':[]}),isEmpty);
 });
 testWidgets('filters reach the server and clearing them restores unrestricted browsing',(t)async{
  final calls=<Uri>[];
  final api=client('TRAINEE',(r)async{if(r.url.path.contains('/directory/')){calls.add(r.url);return reply({'items':[gym],'nextCursor':null});}return reply({'items':[]});});
  await t.pumpWidget(host(DirectoryScreen(api:api)));await t.pumpAndSettle();
  await t.tap(find.byKey(const Key('directory.filters')));await t.pumpAndSettle();
  await t.enterText(find.byKey(const Key('directory.filter.region')),'القاهرة');
  await t.enterText(find.byKey(const Key('directory.filter.city')),'مدينة نصر');
  await t.enterText(find.byKey(const Key('directory.filter.price')),'٨٠');
  await t.ensureVisible(find.byKey(const Key('directory.filter.apply')));await t.pumpAndSettle();await t.tap(find.byKey(const Key('directory.filter.apply')));await t.pumpAndSettle();
  expect(calls.last.queryParameters['maxPrice'],'80');expect(calls.last.queryParameters['governorate'],'القاهرة');expect(calls.last.queryParameters['city'],'مدينة نصر');
  await t.tap(find.text('مسح الفلاتر'));await t.pumpAndSettle();
  expect(calls.last.queryParameters.keys,contains('limit'));expect(calls.last.queryParameters.containsKey('maxPrice'),false);expect(calls.last.queryParameters.containsKey('governorate'),false);
  expect(t.takeException(),isNull);
 });
 testWidgets('nearby requests location only when tapped and preserves it across pagination',(t)async{
  var locations=0;final calls=<Uri>[];
  final api=client('TRAINEE',(r)async{if(!r.url.path.contains('/directory/'))return reply({'items':[]});calls.add(r.url);return reply({'items':[{...gym,'id':r.url.queryParameters['cursor']==null?'b1':'b2'}],'nextCursor':r.url.queryParameters['cursor']==null?'next':null});});
  await t.pumpWidget(host(DirectoryScreen(api:api,locate:()async{locations++;return Position(latitude:30.4,longitude:31.1,timestamp:DateTime.now(),accuracy:5,altitude:0,altitudeAccuracy:1,heading:0,headingAccuracy:1,speed:0,speedAccuracy:1);})));await t.pumpAndSettle();
  expect(locations,0);expect(calls.last.queryParameters.containsKey('latitude'),false);
  await t.tap(find.byKey(const Key('directory.nearby')));await t.pumpAndSettle();expect(locations,1);
  expect(calls.last.queryParameters['latitude'],'30.4');
  await t.scrollUntilVisible(find.text(appText('s104')),200);await t.tap(find.text(appText('s104')));await t.pumpAndSettle();
  expect(calls.last.queryParameters['cursor'],'next');expect(calls.last.queryParameters['longitude'],'31.1');expect(find.byType(BranchTile),findsNWidgets(2));
  expect(t.takeException(),isNull);
 });
 testWidgets('late search responses cannot overwrite a newer query',(t)async{
  final old=Completer<http.Response>();
  final api=client('TRAINEE',(r)async{if(!r.url.path.contains('/directory/'))return reply({'items':[]});if(r.url.queryParameters['q']=='قديم')return old.future;return reply({'items':[{...gym,'gym':{'name':r.url.queryParameters['q']??'البداية'}}]});});
  await t.pumpWidget(host(DirectoryScreen(api:api)));await t.pumpAndSettle();
  await t.enterText(find.byKey(const Key('directory.search')),'قديم');await t.pump(const Duration(milliseconds:450));
  await t.enterText(find.byKey(const Key('directory.search')),'جديد');await t.pump(const Duration(milliseconds:450));await t.pumpAndSettle();
  old.complete(reply({'items':[{...gym,'gym':{'name':'نتيجة قديمة'}}]}));await t.pumpAndSettle();
  expect(find.text('جديد'),findsWidgets);expect(find.text('نتيجة قديمة'),findsNothing);expect(t.takeException(),isNull);
 });
 final platforms=TargetPlatformVariant({TargetPlatform.android,TargetPlatform.iOS});
 for(final language in ['ar','en']){
  testWidgets('retain directory and detail review screenshots in $language',(t)async{
   t.view.physicalSize=const Size(393,851);t.view.devicePixelRatio=1;addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);AppLanguage.instance.use(language);
   final api=client('TRAINEE',(r)async{
    if(r.url.path.endsWith('/b1'))return reply({'branch':gym});
    if(r.url.path.contains('/directory/'))return reply({'items':[gym,{...gym,'id':'b2','gym':{'name':'Titan Fitness'},'name':'فرع شبين','visitPricePoints':45,'ratingAverage':4.6},{...gym,'id':'b3','gym':{'name':'Iron Club'},'name':'فرع الباجور','visitPricePoints':30,'ratingAverage':4.9}]});
    return reply({'items':[]});
   });
   const boundary=Key('directory.review');
   await t.pumpWidget(host(RepaintBoundary(key:boundary,child:DirectoryScreen(api:api)),language:language,fontFamily:reviewFont));await t.pumpAndSettle();
   await capture(t,boundary,'directory-$language-${defaultTargetPlatform.name}');
   await t.pumpWidget(host(RepaintBoundary(key:boundary,child:BranchDetail(api:api,id:'b1')),language:language,fontFamily:reviewFont));await t.pump();await t.pump(const Duration(milliseconds:300));
   await capture(t,boundary,'gym-detail-$language-${defaultTargetPlatform.name}');
   await t.pumpWidget(const SizedBox());await t.pump();
  },variant:platforms);
  testWidgets('compact gym cards fit $language and enlarged text on a narrow phone',(t)async{
   t.view.physicalSize=const Size(320,812);t.view.devicePixelRatio=1;addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);AppLanguage.instance.use(language);
   var opened=false;await t.pumpWidget(host(ListView(padding:const EdgeInsets.all(16),children:[BranchTile(branch:{...gym,'gym':{'name':'جيم باسم طويل جدًا لاختبار عرض بطاقة الفرع'}},onTap:()=>opened=true)]),language:language,scale:1.8));await t.pumpAndSettle();
   await t.tap(find.byType(BranchTile));expect(opened,true);expect(t.takeException(),isNull);
  },variant:platforms);
  testWidgets('gym details preserve real data, gallery access and booking in $language',(t)async{
   t.view.physicalSize=const Size(393,851);t.view.devicePixelRatio=1;addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);AppLanguage.instance.use(language);
   final api=client('TRAINEE',(r)async{if(r.url.path.endsWith('/b1'))return reply({'branch':gym});if(r.url.path.endsWith('/services'))return reply({'items':[],'serviceBooking':false});return reply({'policy':{'version':1,'policy':{'mode':'MANUAL','graceMinutes':60}}});});
   await t.pumpWidget(host(BranchDetail(api:api,id:'b1'),language:language));await t.pump();await t.pump(const Duration(milliseconds:300));
   expect(find.byKey(const Key('gym.book')).hitTestable(),findsOneWidget);expect(find.byKey(const Key('gym.directions')).hitTestable(),findsOneWidget);expect(find.text('جيم تجربة'),findsOneWidget);
   await t.tap(find.byKey(const Key('gym.book')));await t.pump();await t.pump(const Duration(milliseconds:300));expect(find.byType(CreateBookingScreen),findsOneWidget);expect(t.takeException(),isNull);
   await t.pumpWidget(const SizedBox());await t.pump();
  },variant:platforms);
 }
 testWidgets('service chips load within the scrolling detail page and open their actual booking',(t)async{
  final b={...gym,'serviceBooking':true,'minimumServicePoints':35};
  final api=client('TRAINEE',(r)async{if(r.url.path.endsWith('/b1'))return reply({'branch':b});if(r.url.path.endsWith('/services'))return reply({'serviceBooking':true,'items':[{'id':'s1','name':'تمرين بأجهزة الجيم','points':35,'durationMinutes':90,'version':1}],'hours':{'openMinute':480,'closeMinute':1380,'version':1}});return reply({'policy':{'version':1,'policy':{'mode':'MANUAL','graceMinutes':60}}});});
  await t.pumpWidget(host(BranchDetail(api:api,id:'b1')));await t.pump();await t.pump(const Duration(milliseconds:300));
  await t.scrollUntilVisible(find.text('تمرين بأجهزة الجيم · 35 نقطة'),200);await t.tap(find.text('تمرين بأجهزة الجيم · 35 نقطة'));await t.pump();await t.pump(const Duration(milliseconds:300));
  expect(t.widget<CreateBookingScreen>(find.byType(CreateBookingScreen)).initialServiceId,'s1');expect(t.takeException(),isNull);
  await t.pumpWidget(const SizedBox());await t.pump();
 });
}
