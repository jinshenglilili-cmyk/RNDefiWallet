require 'json'

wallet_package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'expo-modules-wallet'
  s.version        = wallet_package['version'] || '1.0.0'
  s.summary        = '基于 Trust Wallet Core 的内嵌钱包原生模块'
  s.description    = '提供助记词生成/校验/导入、多链地址派生（ETH/TRON/BTC）、消息签名与交易签名能力'
  s.author         = wallet_package['author'] || ''
  s.homepage       = wallet_package['homepage'] || 'https://example.com'
  s.license        = wallet_package['license'] || 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
  s.dependency 'ExpoModulesCore'
  # Trust Wallet Core（预编译二进制，安装时从 GitHub Release 下载）
  s.dependency 'TrustWalletCore', '~> 4.8.4'
end
