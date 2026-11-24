Pod::Spec.new do |s|
  s.name = 'BinaryChatE2EEBridge'
  s.version = '0.1.0'
  s.summary = 'Fail-closed native capability placeholder for Binary Chat.'
  s.license = { :type => 'MIT' }
  s.author = 'Binary Chat'
  s.homepage = 'https://github.com/joy11122/binary-chat'
  s.source = { :git => 'https://github.com/joy11122/binary-chat.git', :tag => s.version.to_s }
  s.source_files = 'Sources/**/*.{swift,h,m,mm,c,cc,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
