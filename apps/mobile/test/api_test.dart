import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';

class MemoryStore implements TokenStore {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }
}

void main() {
  test(
    'wrong current password does not revoke a valid device session',
    () async {
      final store = MemoryStore();
      store.values['session'] = 'old-token';
      final api =
          ApiClient(
              storage: store,
              transport: MockClient(
                (r) async =>
                    http.Response('{"code":"INVALID_CREDENTIALS"}', 401),
              ),
            )
            ..user = {'id': 'one'}
            ..token = 'old-token';
      await expectLater(
        api.authenticate('auth/password/change', {
          'currentPassword': 'incorrect',
          'newPassword': 'new long synthetic password',
        }),
        throwsA(isA<ApiFailure>()),
      );
      expect(api.user?['id'], 'one');
      expect(api.token, 'old-token');
      expect(store.values['session'], 'old-token');
    },
  );

  test('money and Arabic digits never use floating point', () {
    expect(money('900719925474099312'), '9007199254740993.12');
    expect(money('-105'), '-1.05');
    expect(piasters('١٢٣.٤٥'), '12345');
    expect(piasters('1.001'), isNull);
    expect(digits('١۲٣'), '123');
  });
  test(
    'uncertain financial request survives restart and retries exact user-bound key and body once',
    () async {
      final store = MemoryStore(), seen = <http.Request>[];
      var fail = true;
      final transport = MockClient((r) async {
        seen.add(r);
        if (fail) throw http.ClientException('offline');
        return http.Response(jsonEncode({'id': 'synthetic-receipt'}), 201);
      });
      final a = ApiClient(storage: store, transport: transport)
        ..user = {'id': 'owner-1'}
        ..token = 'synthetic';
      final body = {'points': 10, 'recipientId': 'trainee-1'};
      await expectLater(
        a.transact('gyms/g1/point-transfers', body),
        throwsA(
          isA<ApiFailure>().having((e) => e.uncertain, 'uncertain', true),
        ),
      );
      expect(store.values['pending.owner-1'], isNotNull);
      final original = Map<String, dynamic>.from(
        jsonDecode(store.values['pending.owner-1']!),
      );
      final b = ApiClient(storage: store, transport: transport)
        ..user = {'id': 'owner-1'}
        ..token = 'synthetic'
        ..pending = original;
      await expectLater(
        b.transact('gyms/g1/point-transfers', {'points': 11}),
        throwsA(isA<ApiFailure>()),
      );
      expect(store.values['pending.owner-1'], isNotNull);
      fail = false;
      final r = await b.retryPending();
      expect(r['id'], 'synthetic-receipt');
      expect(seen.length, 2);
      expect(
        seen[0].headers['idempotency-key'],
        seen[1].headers['idempotency-key'],
      );
      expect(seen[0].body, seen[1].body);
      expect(b.pending, isNull);
      expect(store.values['pending.owner-1'], isNull);
    },
  );
  test(
    'expired session preserves an uncertain operation for authenticated retry',
    () async {
      final store = MemoryStore(),
          a =
              ApiClient(
                  storage: store,
                  transport: MockClient(
                    (_) async =>
                        http.Response('{"code":"UNAUTHENTICATED"}', 401),
                  ),
                )
                ..user = {'id': 'owner-1'}
                ..token = 'synthetic';
      await expectLater(
        a.transact('topups', {'points': 10}),
        throwsA(isA<ApiFailure>()),
      );
      expect(a.user, isNull);
      expect(store.values['pending.owner-1'], isNotNull);
    },
  );
  test(
    'password change carries current bearer and replaces token only after secure storage',
    () async {
      final store = MemoryStore();
      String? received;
      final a =
          ApiClient(
              storage: store,
              transport: MockClient((r) async {
                received = r.headers['authorization'];
                return http.Response(
                  jsonEncode({
                    'user': {'id': 'one'},
                    'accessToken': 'new-token',
                  }),
                  200,
                );
              }),
            )
            ..user = {'id': 'one'}
            ..token = 'old-token';
      await a.authenticate('auth/password/change', {
        'currentPassword': 'synthetic',
        'newPassword': 'synthetic new long password',
      });
      expect(received, 'Bearer old-token');
      expect(store.values['session'], 'new-token');
    },
  );
  test('definitive insufficient balance response clears retry', () async {
    final store = MemoryStore(),
        a =
            ApiClient(
                storage: store,
                transport: MockClient(
                  (_) async =>
                      http.Response('{"code":"INSUFFICIENT_POINTS"}', 409),
                ),
              )
              ..user = {'id': 'owner-1'}
              ..token = 'synthetic';
    await expectLater(
      a.transact('gyms/g1/point-transfers', {'points': 10}),
      throwsA(isA<ApiFailure>()),
    );
    expect(a.pending, isNull);
    expect(store.values['pending.owner-1'], isNull);
  });
}
